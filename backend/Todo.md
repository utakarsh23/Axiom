# Todo

## Parser / Call Graph Quality Improvements

Current state: ingestion pipeline works end-to-end but parsing is noisy. Graph has too many unimportant edges and missing structural hierarchy.

### Problems
- Noise call targets: `toString`, `map`, `filter`, `push`, `forEach`, `split`, `join`, `find`, `has`, `set`, `get`, `sort`, etc. are stored as CALLS/CALLS_EXTERNAL edges — not useful
- `await axios.get`, `await axios.post` stored verbatim as callee names — should be collapsed to just `axios` ExternalService node
- No `File` node — graph has no structural hierarchy; should be `File → Function → Calls`
- Anonymous / trivial entities (IIFEs, arrow stubs) being ingested

### Fix Scope
- [ ] Add call target blocklist to all walkers (`tsWalker.ts`, `jsWalker.ts`, etc.) — filter out builtins + prototype methods before emitting
- [ ] Add module-level callee extraction — `await axios.get(...)` → extract `axios`, strip method suffix
- [ ] Emit `File` node as a first-class entity from walkers, with `DECLARES` edges to functions/classes/endpoints
- [ ] Add entity-level filter — skip anonymous functions and entities without meaningful names

---

## Ingestion Service

### v2 — Cross-Service Call Detection (`src/extractor/tsWalker.ts`)

Add detection for the following patterns inside the `call_expression` case:

| Pattern | Example | Graph Edge | Target Node |
|---------|---------|------------|-------------|
| Kafka | `producer.send('topic-name', message)` | `CALLS_API` | `ExternalService: kafka:<topic>` |
| RabbitMQ | `channel.publish('exchange', ...)` | `CALLS_API` | `ExternalService: rabbitmq:<exchange>` |
| NATS | `nc.publish('subject', data)` | `CALLS_API` | `ExternalService: nats:<subject>` |
| gRPC | `client.MethodName(request)` | `CALLS_API` | `ExternalService: grpc:<service>` |
| HTTP client | `axios.get(url)` / `fetch(url)` | `CALLS_API` | `ExternalService` parsed from URL |

These produce `CALLS_API` edges in Neo4j, not `CALLS` edges.
Impact traversal must follow both edge types for full cross-service blast radius.

---

## All Services — Refactor Routers to Controllers

Currently all services use a flat `src/api/router.ts` that calls service handlers directly.
Refactor to a proper controller layer across all services.

**Target structure:**
```
src/
  api/
    router.ts                    — routing only, maps path → controller method
    controllers/
      workspace.controller.ts
      repo.controller.ts
      (one file per resource)
```

**Controller responsibilities:**
- Extract and validate request params / body / headers
- Call the service handler
- Format and send the HTTP response
- Map `err.status` to correct HTTP status codes

**Services to refactor:**
- [ ] `workspace-service` — workspaceController + repoController
- [ ] `search-service` — searchController
- [ ] `documentation-service` — docController
- [ ] `vector-service` — vectorController
- [ ] `graph-service` — graphController
- [ ] `ingestion-service` — webhookController
- [ ] `auth-service` — authController (OAuth + verify endpoints)

---

## Infrastructure

- [x] `nginx.conf` — reverse proxy routing + `auth_request` for all protected routes
- [x] `docker-compose.yml` — internal Docker network, only NGINX exposed on :80/:443

---

## NATS — Migrate to JetStream

**Problem:** Core NATS is fire-and-forget. Messages published when no subscriber is listening are lost permanently. This makes the entire event chain unreliable — if any subscriber service restarts or starts late, it misses events.

**Fix:** NATS JetStream — persistent streams with at-least-once delivery and replay.

**Scope:**
- Start NATS server with `-js` flag
- Add `src/nats/streams.ts` to each publisher service — defines streams for each subject on startup
- Every `client.ts` — add `js = nc.jetstream()` after connect
- Every `nc.publish()` publisher → `js.publish()`
- Every `nc.subscribe()` subscriber → `js.subscribe()` with durable consumer name + `msg.ack()`

**Services affected:** workspace-service (publisher), ingestion-service (publisher + subscriber), graph-service, vector-service, documentation-service, ci-vuln-service (all subscribers)

**Subjects to stream:** `REPO_ADDED`, `COMMIT_RECEIVED`, `ENTITY_CREATED`, `ENTITY_UPDATED`, `ENTITY_DELETED`, `RELATION_ADDED`, `RELATION_REMOVED`, `EMBEDDING_REQUIRED`, `DOC_REQUIRED`

---

## Security — `x-user-id` Header Trust

**Problem:** All services consume `x-user-id` from the request header directly without validating it. Any client can pass an arbitrary `x-user-id` and get a `200` with another user's data.

**Root cause:** In production, NGINX sets `x-user-id` after a successful `auth_request` to Auth Service — clients never set it. But services don't enforce this.

**Fix (two layers):**

1. **NGINX layer** — already handled: `proxy_set_header X-User-ID $user_id` overwrites any client-supplied value. Clients cannot inject it past NGINX.

2. **Service layer (defense in depth)** — each service should verify the `x-user-id` header against the JWT when both are present. Options:
   - Pass the JWT through NGINX to downstream services and have each service re-verify on sensitive operations, OR
   - Add a shared middleware that rejects requests where `x-user-id` does not match the JWT `userId` claim (for direct dev/test calls without NGINX)

**Scope:** All services that read `x-user-id` — workspace, ingestion, graph, vector, documentation, search, ci-vuln.

**Priority:** Must fix before any public exposure. Safe behind NGINX in internal Docker network, but risky during local dev/testing.
