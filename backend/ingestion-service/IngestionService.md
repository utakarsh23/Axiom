# Ingestion Service

The mutation engine of Axiom. Converts raw repository content into structured events that drive every downstream system (Graph Service, Vector Service, Docs Service).

---

## Responsibilities

- GitHub API integration — tree fetch, file fetch, webhook handling
- AST parsing — polyglot, 9 languages via WASM (no native compilation)
- Entity extraction — functions, classes, endpoints, imports, call sites
- Hash computation — signatureHash, bodyHash, callListHash per entity
- Diff computation — compares current parse against last known state in MongoDB
- Event emission — publishes structural facts to NATS

This service **never** writes to Neo4j, ChromaDB, or calls the LLM. It only emits events.

---

## Modes

### Full Mode (Cold Start)
Triggered by `REPO_ADDED` from the Workspace Service (fired once per repo when registered).

```
REPO_ADDED (NATS)
  → fetch entire repo file tree at HEAD commit (GitHub API)
  → for each supported file:
      → fetch file content
      → parse AST (in memory)
      → extract entities + calls
      → compute hashes
      → computeDiff with empty old state (everything is ENTITY_CREATED)
      → publishEvents to NATS
      → upsert hashes + call lists to MongoDB
```

### Diff Mode (Incremental)
Triggered by `COMMIT_RECEIVED` — published by the webhook handler when GitHub fires a push event.

```
COMMIT_RECEIVED (NATS)
  → fetch only changed files for this commit (GitHub API)
  → for each changed file:
      → if deleted → emit ENTITY_DELETED + RELATION_REMOVED for all stored entities → delete from MongoDB
      → else:
          → fetch current file content
          → parse AST (in memory)
          → extract entities + calls
          → compute new hashes
          → fetch old hashes + call lists from MongoDB
          → computeDiff → emits only what changed
          → publishEvents to NATS
          → upsert new state to MongoDB
          → delete MongoDB records for entities no longer in file
```

---

## Events Published

| Event | When |
|---|---|
| `ENTITY_CREATED` | New entity found, not in previous state |
| `ENTITY_UPDATED` | Signature or body changed |
| `ENTITY_DELETED` | Entity no longer present in file |
| `RELATION_ADDED` | New call site appeared (callee may be internal or external) |
| `RELATION_REMOVED` | Call site removed |
| `EMBEDDING_REQUIRED` | Entity is new or body changed — needs re-vectorization |

> `RELATION_ADDED` payloads carry `callerName` and `calleeName`. Graph Service decides whether `calleeName` resolves to a known workspace entity (`CALLS` edge) or an external dependency (`CALLS_EXTERNAL` edge + `ExternalService` node). Ingestion does not make that distinction — it just emits what it sees.

---

## Events Consumed

| Event | Action |
|---|---|
| `REPO_ADDED` | Trigger Full Mode |
| `COMMIT_RECEIVED` | Trigger Diff Mode |

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

Parser uses `web-tree-sitter` + `tree-sitter-wasms` — no native compilation required.

---

## Source Structure

```
src/
  index.ts              — entry point: boots DB, NATS, parser, HTTP server, subscribers
  logger.ts             — shared pino logger (structured JSON)
  config.ts             — typed config from env vars

  github/
    client.ts           — GitHub App auth, tree fetch, file fetch, commit diff

  parser/
    grammars.ts         — maps file extensions → language + WASM path
    index.ts            — initializes WASM runtime, parses files to AST
    types.ts            — ParsedFile interface

  extractor/
    types.ts            — ExtractedEntity, ExtractedCall, ExtractionResult types
    index.ts            — routes parsed file to correct language walker
    tsWalker.ts         — TypeScript / JavaScript walker
    pyWalker.ts         — Python walker
    javaWalker.ts       — Java walker
    cWalker.ts          — C / C++ walker
    goWalker.ts         — Go walker
    rustWalker.ts       — Rust walker
    solWalker.ts        — Solidity walker

  hasher/
    index.ts            — SHA-256 hashes: signatureHash, bodyHash, callListHash

  diff/
    index.ts            — compares new vs old hashes → produces DiffEvent array

  model/
    entityHash.model.ts — Mongoose schema: stores hashes + call lists between commits

  db/
    client.ts           — Mongoose connect/disconnect

  events/
    index.ts            — NATS publisher (publishEvent, publishEvents, publishRaw)
    subscriber.ts       — NATS subscriber: routes REPO_ADDED / COMMIT_RECEIVED

  modes/
    fullMode.ts         — cold start ingestion handler
    diffMode.ts         — incremental commit ingestion handler

  webhook/
    index.ts            — Express router: verifies GitHub signature, fires COMMIT_RECEIVED
```

---

## Key Design Decisions

**WASM parser** — native `tree-sitter` requires C++ compilation (node-gyp). `web-tree-sitter` + prebuilt WASMs requires nothing — works on any machine, any CI.

**AST is never persisted** — parsed in memory per file, discarded after extraction. Only hashes and call lists are stored in MongoDB.

**Full SHA-256 hashes** — 64-char hex. No truncation.

**Call lists stored as arrays** — not just the hash. Enables precise `RELATION_ADDED`/`RELATION_REMOVED` by set-diffing old vs new callee lists instead of emitting all relations on every call list change.

**Default branch only** — webhook handler ignores pushes to feature branches. Only merges to the default branch trigger ingestion.

**Self-publish-then-subscribe** — webhook fires `COMMIT_RECEIVED` to NATS; subscriber picks it up. Decouples HTTP transport from ingestion logic. Enables replay from any source.

**1MB file size threshold** — files above this are skipped (generated/minified files).

---

## Environment Variables

```env
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
MONGODB_URI=
MONGODB_DB_NAME=
NATS_URL=
PORT=9001
LOG_LEVEL=info
NODE_ENV=development
```

---

## Boot Order

```
connectDB()        — MongoDB must be ready before any event is processed
connectNats()      — NATS publisher must be ready before subscribers start
initParser()       — WASM runtime must load before any file is parsed
startSubscribers() — start consuming events only after all of the above are ready
app.listen()       — HTTP server starts last
```
