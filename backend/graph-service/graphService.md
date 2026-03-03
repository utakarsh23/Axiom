# Graph Service

The structural authority of Axiom. Maintains the temporal knowledge graph in Neo4j. Consumes diff events from ingestion and builds a queryable, append-versioned graph of the entire codebase — across all repos in a workspace.

---

## Responsibilities

- Consumes `ENTITY_CREATED`, `ENTITY_UPDATED`, `ENTITY_DELETED`, `RELATION_ADDED`, `RELATION_REMOVED` from NATS
- Creates and versions nodes (functions, classes, endpoints) and edges (calls, external calls) in Neo4j
- Resolves whether a call target is internal (workspace entity) or external (npm/stdlib) — creates `CALLS` or `CALLS_EXTERNAL` edge accordingly
- Exposes workspace-scoped graph query APIs for the frontend and other services

This service **never** parses code, fetches from GitHub, generates embeddings, or calls the LLM.

---

## Temporal Versioning

Nothing is ever hard deleted from Neo4j. Every node and edge carries:

- `validFrom` — the commit SHA it was created at
- `validTo` — the commit SHA it was closed at (`null` = currently active)

On `ENTITY_UPDATED`: the active version is closed (`validTo = commitHash`), a new version is created (`validFrom = commitHash`, `validTo = null`).

On `ENTITY_DELETED`: the active version is closed. The node remains in Neo4j, queryable via timeline queries.

This enables:
- **Timeline queries** — graph state at any historical commit
- **Drift detection** — compare graph at two commits
- **Audit trail** — full history of every structural change

---

## Node Types

| Node | Description |
|---|---|
| `Function` | Extracted function or method from source code |
| `Class` | Extracted class |
| `Endpoint` | HTTP route (Express, FastAPI, etc.) |
| `ExternalService` | npm package or stdlib — call target only, not parsed |

All internal nodes carry: `entityId`, `name`, `filePath`, `repoId`, `workspaceId`, `kind`, `language`, `validFrom`, `validTo`, `createdAt`

`entityId` is a deterministic SHA-256 hash of `workspaceId:repoId:filePath:entityName` (first 24 chars). Used as the MERGE key — enables idempotent upserts regardless of which commit produced the event.

`ExternalService` nodes carry: `name`, `workspaceId`, `kind: 'external'`, `createdAt`

---

## Edge Types

| Edge | Meaning |
|---|---|
| `CALLS` | Caller → Callee (both are known workspace entities, cross-file or cross-repo) |
| `CALLS_EXTERNAL` | Caller → ExternalService (callee not found in workspace) |

All edges carry: `workspaceId`, `validFrom`, `validTo`

---

## Events Consumed

All event payloads use `entityId` (stable SHA-256 hash) + `entityName` as emitted by the ingestion diff engine.

| Event | Action |
|---|---|
| `ENTITY_CREATED` | `MERGE (e { entityId })` — idempotent, safe to replay |
| `ENTITY_UPDATED` | Close active node by `entityId` (`validTo = commitHash`), CREATE new version (`validFrom = commitHash`) |
| `ENTITY_DELETED` | Close active node by `entityId` (`validTo = commitHash`) — no hard delete |
| `RELATION_ADDED` | Check if callee `name` exists in workspace → `CALLS` edge; else → `ExternalService` + `CALLS_EXTERNAL` edge |
| `RELATION_REMOVED` | Close active `CALLS` or `CALLS_EXTERNAL` edge — tries both edge types |

---

## Query API

All routes are workspace-scoped — no cross-workspace data ever returned.

| Method | Route | Description |
|---|---|---|
| `GET` | `/graph/:workspaceId` | Full live graph — all repos in workspace |
| `GET` | `/graph/:workspaceId/repo/:repoId` | Scoped to a single repo |
| `GET` | `/graph/:workspaceId/impact/:entityName` | Blast radius — upstream callers + downstream callees (10 hops, 500 node cap per direction) |
| `GET` | `/graph/:workspaceId/timeline?commit=abc123` | Graph state at a specific commit SHA |
| `GET` | `/health` | Health check |

### Response shape — graph endpoints

```json
{
  "nodes": [
    { "name": "getUserById", "kind": "function", "filePath": "src/users.ts", "repoId": "...", "language": "typescript" }
  ],
  "edges": [
    { "source": "getUserById", "target": "fetchFromDb", "type": "CALLS" },
    { "source": "getUserById", "target": "axios", "type": "CALLS_EXTERNAL" }
  ]
}
```

### Response shape — impact endpoint

```json
{
  "entity": { "name": "getUserById", ... },
  "upstream": [ ...entities that call getUserById... ],
  "downstream": [ ...entities getUserById calls... ]
}
```

---

## Source Structure

```
src/
  index.ts                  — entry point: boots Neo4j, NATS, HTTP server, subscribers
  logger.ts                 — shared pino logger (structured JSON)
  config.ts                 — typed config from env vars

  db/
    client.ts               — Neo4j driver: connect, disconnect, runQuery helper

  events/
    subscriber.ts           — NATS subscriber: routes all 5 diff events to handlers

  handlers/
    entity.ts               — ENTITY_CREATED, ENTITY_UPDATED, ENTITY_DELETED → Cypher writes
    relation.ts             — RELATION_ADDED, RELATION_REMOVED → Cypher writes

  services/
    graphService.ts         — all Cypher read queries (workspace graph, repo graph, impact, timeline)

  api/
    router.ts               — Express routes — routing only, delegates to graphService
```

---

## Key Design Decisions

**`entityId` as MERGE key** — `MERGE (e { entityId })` ensures deduplication by the stable entity identity, not by name or filePath. Payload carries both `entityId` and `entityName` — `entityId` for graph keying, `name` stored as a searchable property.

**MERGE without `validFrom` in identity pattern** — `validFrom` is set in `ON CREATE SET` only. If an event is replayed (NATS at-least-once), it won't create duplicate nodes or edges.

**`language` inherited on update** — `ENTITY_UPDATED` payload doesn't carry `language` separately. The new node version reads `language` from the old closed node (`MATCH old ... CREATE e { language: COALESCE($language, old.language) }`).

**`RELATION_REMOVED` tries both edge types** — ingestion payload doesn't specify edge type. Both `CALLS` and `CALLS_EXTERNAL` close queries are run — the one that doesn't match does nothing.

**Blast radius capped at 10 hops / 500 nodes** — prevents infinite traversal on circular dependency graphs.

**ExternalService is workspace-scoped** — `MERGE (ext:ExternalService { name, workspaceId })` ensures one node per package per workspace. Multiple functions calling `axios` share the same ExternalService node.

## Known Issues / Upcoming Fixes

- **Noise call targets** — builtin/prototype method names (`toString`, `map`, `filter`, `push`, `forEach`, etc.) are currently stored as CALLS_EXTERNAL edges. To be filtered at the walker layer.
- **`await axios.get` verbatim** — method calls on HTTP clients (`axios.get`, `axios.post`) stored as literal callee names. To be collapsed to module name (`axios`) at extraction.
- **No `File` node** — graph currently has no `File` → `Function` hierarchy. `DECLARES` edges and `File` nodes to be added in a future walker pass.
- **NATS at-least-once** — ingestion events can be replayed; handlers are idempotent via entityId MERGE but edge deduplication via MERGE on relation identity.

---

## Environment Variables

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
NATS_URL=nats://localhost:4222
PORT=9002
LOG_LEVEL=info
NODE_ENV=development
```

---

## Boot Order

```
connectDB()         — Neo4j must be ready (verifyConnectivity handshake) before events are processed
startSubscribers()  — start consuming NATS events only after DB is ready
app.listen()        — HTTP server starts last
```
