# Ingestion Service

The mutation engine of Axiom. Converts raw repository content into structured events that drive every downstream system (Graph Service, Vector Service, Documentation Service, CI/Vuln Service).

**Port:** `9001`

---

## Responsibilities

- GitHub App authentication via `@octokit/auth-app` (CJS-compatible)
- Full Mode: cold start — fetch entire repo tree, parse all files, emit `ENTITY_CREATED` for everything
- Diff Mode: incremental — fetch only changed files for a commit, emit only what changed
- AST parsing — polyglot, 9 languages via WASM (no native compilation)
- Entity extraction — functions, classes, endpoints, call sites
- Hash computation — `signatureHash`, `bodyHash`, `callListHash` per entity
- Diff computation — compares current parse against last known state in MongoDB
- Event emission — publishes structural facts to NATS

This service **never** writes to Neo4j, ChromaDB, or calls the LLM. It only emits events.

---

## Modes

### Full Mode (Cold Start)
Triggered by `REPO_ADDED` from Workspace Service (once per repo when registered).

```
REPO_ADDED (NATS)
  → if commitSha not provided, resolve latest HEAD commit from GitHub API
  → fetch entire repo file tree at that commit
  → for each supported file:
      → fetch file content
      → parse AST
      → extract entities + calls
      → compute hashes
      → computeDiff with empty old state (everything is ENTITY_CREATED)
      → publishEvents to NATS
      → upsert hashes + call lists to MongoDB
```

### Diff Mode (Incremental)
Triggered by `COMMIT_RECEIVED` — published by the webhook handler when GitHub sends a push event.

```
COMMIT_RECEIVED (NATS)
  → fetch only changed files for this commit (GitHub API)
  → for each changed file:
      → if deleted → emit ENTITY_DELETED + RELATION_REMOVED for all stored entities
      → else:
          → fetch current file content
          → parse AST
          → extract entities + calls
          → compute new hashes
          → fetch old hashes + call lists from MongoDB
          → computeDiff → emit only what changed
          → publishEvents to NATS
          → upsert new state to MongoDB
          → delete MongoDB records for entities no longer in file
```

> **Important:** The webhook payload from GitHub already contains `installationId`, `owner`, `repo`, and `commitSha` directly. However, `workspaceId` and `repoId` are Axiom concepts not available in the webhook — these are currently forwarded as empty strings and need to be resolved via the Workspace Service in a future version.

---

## Events Consumed

| Subject | Action |
|---|---|
| `REPO_ADDED` | Trigger Full Mode |
| `COMMIT_RECEIVED` | Trigger Diff Mode |

### `REPO_ADDED` payload (from Workspace Service)
```json
{
  "workspaceId":    "...",
  "repoId":         "...",
  "installationId": 12345678,
  "owner":          "github-org-or-user",
  "repo":           "repo-name",
  "branch":         "main"
}
```
`commitSha` is optional — if absent, Ingestion resolves the latest HEAD commit from GitHub.

### `COMMIT_RECEIVED` payload (from Webhook handler)
```json
{
  "workspaceId":    "",
  "repoId":         "",
  "installationId": 12345678,
  "owner":          "github-org-or-user",
  "repo":           "repo-name",
  "commitSha":      "abc123..."
}
```

---

## Events Published

All events carry `entityId` — a deterministic SHA-256 hash of `workspaceId:repoId:filePath:entityName` (first 24 chars). This is the stable cross-service entity identifier used by Graph, Vector, Doc, and CI/Vuln services.

All events use `entityName` (not `name`) for the entity's display name, matching the diff engine output.

| Subject | When | Key Payload Fields |
|---|---|---|
| `ENTITY_CREATED` | New entity, not in previous state | `entityId, entityName, kind, language, filePath, repoId, workspaceId, commitHash` |
| `ENTITY_UPDATED` | Signature or body changed | `entityId, entityName, kind, language, filePath, repoId, workspaceId, commitHash, code, callList` |
| `ENTITY_DELETED` | Entity no longer present in file | `entityId, entityName, filePath, repoId, workspaceId, commitHash` |
| `RELATION_ADDED` | New call site appeared | `callerName, calleeName, filePath, repoId, workspaceId, commitHash` |
| `RELATION_REMOVED` | Call site removed | `callerName, calleeName, filePath, repoId, workspaceId` |
| `EMBEDDING_REQUIRED` | Entity new or body changed | `entityId, entityName, kind, language, filePath, repoId, workspaceId, code` |
| `DOC_REQUIRED` | Entity new or body changed | `entityId, entityName, kind, language, filePath, repoId, workspaceId, commitHash, code, callList` |

---

## Webhook (Commit Flow)

```
GitHub push event → POST /webhook/github
  → verify HMAC-SHA256 signature (timing-safe compare)
  → respond 200 immediately (GitHub requires fast ack)
  → if event == 'push' AND ref == default branch:
      → publish COMMIT_RECEIVED to NATS with { installationId, owner, repo, commitSha }
      → subscriber picks up COMMIT_RECEIVED → runs Diff Mode
```

Only pushes to the **default branch** trigger ingestion. Feature branch pushes are ignored.

---

## GitHub Auth

Uses `@octokit/auth-app` (CJS-compatible) instead of `@octokit/app` (ESM-only, incompatible with Node v23 + CJS).

```typescript
// Per-request installation client — called with installationId from the event payload
const auth = createAppAuth({ appId, privateKey, installationId });
const { token } = await auth({ type: 'installation' });
const octokit = new Octokit({ auth: token });
```

Required env vars: `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`.

---

## Supported Languages

| Language | Parser |
|---|---|
| TypeScript | `tree-sitter-typescript` (WASM) |
| JavaScript | `tree-sitter-javascript` (WASM) |
| Python | `tree-sitter-python` (WASM) |
| Java | `tree-sitter-java` (WASM) |
| C | `tree-sitter-c` (WASM) |
| C++ | `tree-sitter-cpp` (WASM) |
| Go | `tree-sitter-go` (WASM) |
| Rust | `tree-sitter-rust` (WASM) |
| Solidity | `tree-sitter-solidity` (WASM) |

> **WASM version pin:** `web-tree-sitter@0.20.8` + `tree-sitter-wasms` must be kept in sync. An ABI mismatch between these two packages causes silent parser failure at runtime. Do not upgrade either independently without verifying ABI compatibility.

---

## Source Structure

```
src/
  index.ts              — entry point: DB → NATS → parser → subscribers → HTTP
  config.ts             — typed config from env vars
  logger.ts             — shared pino logger

  github/
    client.ts           — getInstallationClient, fetchRepoTree, fetchFileContent,
                          fetchCommitDiff, fetchLatestCommitSha

  parser/               — WASM runtime + per-language AST parsing
  extractor/            — entity + call extraction from parsed AST
  hasher/               — signatureHash, bodyHash, callListHash (SHA-256)

  diff/
    index.ts            — computeDiff: produces DiffEvent[] from old vs new hashes.
                          Generates stable entityId per entity.

  model/
    entityHash.model.ts — stores hashes + call lists between commits (MongoDB)

  db/
    client.ts           — Mongoose connect/disconnect

  events/
    index.ts            — NATS publisher
    subscriber.ts       — routes REPO_ADDED → Full Mode, COMMIT_RECEIVED → Diff Mode

  modes/
    fullMode.ts         — cold start: resolves commitSha if absent, fetches full tree
    diffMode.ts         — incremental: fetches only changed files

  webhook/
    index.ts            — verifies GitHub signature, publishes COMMIT_RECEIVED
```

---

## Environment Variables

```env
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=axiom_ingestion
NATS_URL=nats://localhost:4222
PORT=9001
LOG_LEVEL=info
NODE_ENV=development
```

---

## Boot Sequence

```
connectDB()        — MongoDB ready (hashes need DB before first event)
connectNats()      — NATS publisher ready
initParser()       — WASM runtime loads (required before any file is parsed)
startSubscribers() — start consuming REPO_ADDED / COMMIT_RECEIVED
app.listen(9001)   — webhook endpoint ready
```

---

## Key Design Decisions

**`@octokit/auth-app` instead of `@octokit/app`** — `@octokit/app` v16 is ESM-only and crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED` on Node v23 + CJS. `@octokit/auth-app` is CJS-compatible and provides identical per-installation token generation.

**`commitSha` is optional on Full Mode** — Workspace Service doesn't need to resolve it. `fetchLatestCommitSha()` is called by Ingestion itself using the GitHub API.

**Deterministic `entityId`** — `sha256(workspaceId:repoId:filePath:entityName).slice(0,24)`. Same entity always gets the same ID regardless of which commit or mode produced it. Enables idempotent upserts in Graph/Vector/Doc.

**AST is never persisted** — parsed in memory per file, discarded after extraction. Only hashes and call lists are stored.

**Call lists stored as arrays** — enables precise `RELATION_ADDED`/`RELATION_REMOVED` by set-diffing old vs new callee lists.

**Default branch only** — webhook ignores pushes to feature branches. Only merges to default branch trigger ingestion.

**Mongoose `returnDocument: 'after'`** — `findOneAndUpdate` uses `{ returnDocument: 'after' }` (not the deprecated `{ new: true }`) in both `fullMode.ts` and `diffMode.ts`.

---

## Known Issues / Upcoming Fixes

- **Noisy call extraction** — walkers currently emit all call targets including builtins (`toString`, `map`, `filter`, `push`, `forEach`, etc.). These pollute RELATION_ADDED events and Neo4j. To be filtered via blocklist in walker layer.
- **`await axios.get` verbatim** — member call expressions stored as literal callee names (`await axios.get`). Should extract just the module name (`axios`) and use `CALLS_EXTERNAL` to a single `axios` ExternalService node.
- **No `File` node emission** — walkers don't currently emit a `File` entity or `DECLARES` edges. Graph hierarchy is flat (no `File → Function` link). To be added.
- **`workspaceId`/`repoId` missing in `COMMIT_RECEIVED`** — webhook payload from GitHub doesn't include Axiom IDs. Currently forwarded as empty strings in `COMMIT_RECEIVED`. Needs lookup against Workspace Service to resolve.

