# Axiom — Changelog

All notable changes to this project are documented here, organized by service.

---

## [Unreleased]

### Auth Service
- **Added** GitHub OAuth 2.0 flow — redirect, code exchange, access token, profile fetch
- **Added** JWT issuance with `userId`, `githubId`, `username` payload
- **Added** `GET /auth/verify` — NGINX `auth_request` endpoint; returns `x-user-id` header on valid token
- **Added** `GET /auth/me` — returns current user profile from token
- **Added** User upsert by `githubId` on every login — refreshes `username` and `email`
- **Added** MongoDB `users` collection with unique index on `githubId`
- **Added** Graceful shutdown — MongoDB disconnect on `SIGTERM` / `SIGINT`

---

### NGINX
- **Added** Reverse proxy routing — all client traffic routed to downstream services by path prefix
- **Added** `auth_request /auth/verify` on all protected routes — JWT verified before every proxied request
- **Added** `x-user-id` header injection from `auth_request` response into proxied upstream requests
- **Added** SSL termination, rate limiting, load balancing config
- **Added** Routing table:
  - `/auth/**` → Auth Service (8080) — public, no auth
  - `/workspaces/**` → Workspace Service (9000)
  - `/search/**` → Search Service (9006)
  - `/docs/**` → Doc Service (9005)
  - `/ingest/**` → Ingestion Service (9001)
  - `/graph/**` → Graph Service (9002)
  - `/ci/**` → CI/Vuln Service (9007)

---

### Workspace Service
- **Added** Workspace CRUD — create, read, delete workspaces scoped to authenticated user
- **Added** Repository CRUD — add, read, delete repos within a workspace
- **Added** `PATCH /workspaces/:workspaceId/installation` — stores GitHub App `installationId` on workspace
- **Added** `owner` auto-parsed from `gitUrl` at repo creation — never supplied by client
- **Added** `GET/PUT /workspaces/:workspaceId/rulebook` — per-workspace coding standards
- **Added** Rulebook schema: `naming`, `comments`, `structure`, `architecture` fields
- **Added** `REPO_ADDED` NATS publish on repo creation — triggers cold start ingestion
- **Added** MongoDB `workspaces` collection — unique index on `{ userId, name }`
- **Added** MongoDB `repos` collection — unique index on `{ workspaceId, name }`
- **Added** Guard: returns `400` if `installationId` not set on workspace when adding a repo
- **Added** Graceful shutdown — NATS drain + MongoDB disconnect

---

### Ingestion Service
- **Added** GitHub App authentication via `@octokit/auth-app` (CJS-compatible, avoids ESM crash on Node v23)
- **Added** Full Mode (cold start) — triggered by `REPO_ADDED`:
  - Resolves HEAD commit SHA via `fetchLatestCommitSha()` if not provided
  - Fetches full repo file tree at HEAD commit
  - Parses each supported file, extracts entities and call sites
  - Computes `signatureHash`, `bodyHash`, `callListHash` per entity
  - Emits `ENTITY_CREATED`, `RELATION_ADDED`, `EMBEDDING_REQUIRED`, `DOC_REQUIRED`
  - Upserts entity hashes + call lists to MongoDB
- **Added** Diff Mode (incremental) — triggered by `COMMIT_RECEIVED`:
  - Fetches only changed files for the commit
  - Re-parses entire changed file (not diff lines)
  - Compares hashes against stored state
  - Emits only delta: `ENTITY_UPDATED`, `ENTITY_DELETED`, `RELATION_ADDED`, `RELATION_REMOVED`
  - Updates MongoDB entity hash store
- **Added** Webhook handler — `POST /webhook/github`:
  - Verifies HMAC-SHA256 signature (timing-safe compare)
  - Acks GitHub immediately (200)
  - Publishes `COMMIT_RECEIVED` for pushes to default branch only
- **Added** Polyglot AST parsing via `web-tree-sitter@0.20.8` WASM — 9 languages: TypeScript, JavaScript, Python, Java, C, C++, Go, Rust, Solidity
- **Added** Entity extraction: functions, classes, HTTP endpoints, call sites
- **Added** Deterministic `entityId` — SHA-256 of `workspaceId:repoId:filePath:entityName` (first 24 chars)
- **Added** `endpointMatcher.ts` — auto-creates `API_CALL` edges between matching endpoints in workspace
- **Added** Express router handler extraction in `tsWalker.ts` (endpoint → handler `CALLS` edges)
- **Added** `endpointMatcher` wired into `ENTITY_CREATED` subscriber flow
- **Added** MongoDB `entityHashes` collection — stores hashes and call lists between commits
- **Known issue** Walker emits all call targets including builtins (`map`, `filter`, `forEach`, etc.)
- **Known issue** `await axios.get` stored verbatim instead of collapsed to `axios` ExternalService
- **Known issue** `File` nodes and `DECLARES` edges not yet emitted — graph hierarchy is flat
- **Known issue** `workspaceId` / `repoId` missing in `COMMIT_RECEIVED` webhook payload — forwarded as empty strings

---

### Graph Service
- **Added** NATS subscriber for `ENTITY_CREATED`, `ENTITY_UPDATED`, `ENTITY_DELETED`, `RELATION_ADDED`, `RELATION_REMOVED`
- **Added** `ENTITY_CREATED` handler — `MERGE (e { entityId })` idempotent node creation
- **Added** `ENTITY_UPDATED` handler — closes active version (`validTo = commitHash`), creates new version (`validFrom = commitHash`)
- **Added** `ENTITY_DELETED` handler — closes active node, no hard delete
- **Added** `RELATION_ADDED` handler — resolves callee: `CALLS` edge if in workspace, `ExternalService` + `CALLS_EXTERNAL` edge if not
- **Added** `RELATION_REMOVED` handler — closes active edge (tries both `CALLS` and `CALLS_EXTERNAL`)
- **Added** Temporal versioning — every node/edge carries `validFrom`, `validTo`, `commitHash`
- **Added** `ExternalService` nodes — workspace-scoped, merged by `{ name, workspaceId }` — multiple callers share one node
- **Added** Node types: `Function`, `Class`, `Endpoint`, `ExternalService`
- **Added** Edge types: `CALLS`, `CALLS_EXTERNAL`
- **Added** `GET /graph/:workspaceId` — full live graph for all repos in workspace
- **Added** `GET /graph/:workspaceId/repo/:repoId` — scoped to single repo
- **Added** `GET /graph/:workspaceId/impact/:entityName` — blast radius traversal (10 hops, 500 node cap per direction)
- **Added** `GET /graph/:workspaceId/timeline?commit=abc123` — graph state at specific commit
- **Added** `GET /graph/:workspaceId/entry-files` — root file detection (zero incoming `CALLS` edges)
- **Added** `GET /graph/:repoId/file-functions?filePath=...` — all entities inside a file
- **Added** `GET /graph/:repoId/function-calls?name=...&filePath=...` — internal + external calls for a function
- **Known issue** Noisy `CALLS_EXTERNAL` edges from builtin/prototype methods
- **Known issue** Member calls (`axios.get`) stored verbatim instead of collapsed
- **Known issue** No `File` node or `DECLARES` edges — flat graph hierarchy

---

### Vector Service
- **Added** NATS subscriber for `EMBEDDING_REQUIRED`, `ENTITY_UPDATED`, `ENTITY_DELETED`
- **Added** `EMBEDDING_REQUIRED` handler — calls `POST /llm/embed` → upserts vector to ChromaDB
- **Added** `ENTITY_UPDATED` handler — re-fetches embedding → upserts (overwrites by `entityId`)
- **Added** `ENTITY_DELETED` handler — deletes vector from ChromaDB by `entityId`
- **Added** `POST /vector/query` — cosine similarity search; accepts natural language or raw code snippet
- **Added** Per-workspace ChromaDB collections — `workspace-{workspaceId}`
- **Added** Embedding metadata: `entityId`, `workspaceId`, `repoId`, `filePath`, `entityName`, `kind`, `language`
- **Added** Raw source code stored per document in ChromaDB — returned in query results
- **Added** Collection configured with `hnsw:space: cosine` — scores are `1 - cosine_distance`, range 0–1
- **Note** Embedding model lives in LLM Service — Vector Service calls `/llm/embed`, never runs inference itself

---

### LLM Service
- **Added** Generative model runtime — `src/llm/provider.ts` (swap model here, nothing else changes)
- **Added** Embedding model runtime — `src/embeddings/provider.ts` (swap model here, nothing else changes)
- **Added** `POST /llm/explain` — plain-English explanation from assembled graph + vector context
- **Added** `POST /llm/whatif` — consequence report from blast radius + semantic context
- **Added** `POST /llm/patch` — unified diff patch + risk score + severity from structured violation findings
- **Added** `POST /llm/pr` — PR description with risk level, confidence score, impact summary
- **Added** `POST /llm/embed` — dense embedding vector for a given code snippet
- **Note** Fully stateless — no database, no NATS subscriptions, no persistent state
- **Note** Two separate model runtimes: generative (next-token prediction) and embedding (metric learning) — never combined

---

### Doc Service
- **Added** NATS subscriber for `DOC_REQUIRED`, `ENTITY_UPDATED`, `ENTITY_DELETED`
- **Added** `DOC_REQUIRED` handler — fetches 1-hop callers from Graph Service → calls `POST /llm/explain` → upserts doc block
- **Added** `ENTITY_UPDATED` handler — regenerates entity doc block + best-effort regeneration of each 1-hop caller's doc
- **Added** `ENTITY_DELETED` handler — deletes doc block for entity
- **Added** `GET /docs/:workspaceId` — all doc blocks for workspace
- **Added** `GET /docs/:workspaceId/entity/:entityId` — doc block for a specific entity
- **Added** MongoDB `docBlocks` collection — unique index on `{ entityId, workspaceId }`
- **Added** Caller context enrichment — Graph Service failure is non-fatal (continues with empty caller list)
- **Note** All LLM generation delegated to LLM Service — Doc Service never runs inference

---

### Search Service
- **Added** `POST /search` — full semantic search pipeline: Vector → Graph enrichment → Doc enrichment → ranked results
- **Added** Vector Service fan-out — top-K semantically similar entities by cosine similarity
- **Added** Graph Service enrichment — 1-hop callers + callees per result entity (parallel, non-fatal)
- **Added** Doc Service enrichment — doc block per result entity (parallel, non-fatal on 404/failure)
- **Added** Results ranked by descending cosine similarity score
- **Added** `POST /search/rag` — RAG query (Vector + Graph + LLM)
- **Added** `POST /search/whatif` — what-if consequence query (Graph blast radius + Vector similar + LLM)
- **Added** `GET /search/similar` — similarity search (Vector only, no LLM)
- **Note** Pure HTTP orchestrator — no database, no NATS

---

### CI / Vulnerability Service
- **Added** NATS subscriber for `ENTITY_CREATED` and `ENTITY_UPDATED`
- **Added** Tier 1 structural checks via Graph Service Cypher queries:
  - Circular dependency detection
  - Deprecated API still called
  - Removed entity still referenced
  - Forbidden layer access (rulebook `architecture` rules)
- **Added** Tier 2a code pattern checks:
  - Semgrep (`--config=auto`) on entity code — hardcoded secrets, SQL injection, unsafe async, eval
  - `npm audit --json` for CVE detection in dependencies
- **Added** Tier 2b workspace rulebook checks — fetched from Workspace Service per pipeline run:
  - Naming convention validation (regex on entity names)
  - JSDoc presence check
  - Forbidden pattern scan (`console.log`, `debugger`, etc.)
  - Function line limit enforcement
- **Added** LLM escalation gate — Tier 3 only called when Tier 1 or Tier 2 produces findings
- **Added** Structured context assembly for LLM — findings + entity code + callers/callees
- **Added** `POST /llm/patch` call → confirmed violations + unified diff + risk score
- **Added** Simulation safety gate:
  - `HIGH` risk + `HIGH` severity → discard
  - Destructive keywords in patch explanation → discard
  - Blast radius > 20 entities → discard
  - Existing circular deps in workspace → defer
- **Added** Autonomous PR creation via `@octokit/rest` — branch creation, patch commit, PR open
- **Added** Merge policy: `LOW` = auto-merge, `MEDIUM` = require review, `HIGH` = block
- **Note** Never mutates graph directly — every fix flows through the standard commit path after PR merge

---

### Frontend
- **Added** Interactive call graph visualization — React Flow
- **Added** Lazy graph expansion — click file → expand functions; click function → expand calls
- **Added** Node deduplication — `Map<filePath, DOMNode>` prevents duplicate nodes; new edges link to existing node
- **Added** Node types: File (slate), Function (blue), Endpoint (green), Class (purple), ExternalService (orange)
- **Added** Edge types: `CALLS` (solid white), `CALLS_EXTERNAL` (dashed orange), `API_CALL` (dotted green)
- **Added** Entry point detection — files with zero incoming `CALLS` edges shown as root nodes
- **Note** Layout: Dagre (hierarchical) or ELK — TBD
- **Note** Animation: Framer Motion for expand/collapse — TBD

---

## Architecture Decisions

| Decision | Reason |
|---|---|
| `@octokit/auth-app` over `@octokit/app` | `@octokit/app` v16 is ESM-only — crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED` on Node v23 + CJS |
| Two separate LLM model runtimes | Generative uses next-token prediction; embedding uses metric learning — different loss functions, combining degrades both |
| AST never persisted | Parsed in memory per file, discarded after extraction — only hashes and call lists stored |
| `commitSha` optional on Full Mode | Ingestion resolves HEAD itself via `fetchLatestCommitSha()` — Workspace Service doesn't need to know it |
| Deterministic `entityId` via SHA-256 | Same entity always gets same ID across commits and modes — enables idempotent upserts everywhere |
| Entire changed file reparsed on commit | Partial AST from diff lines is unreliable — full file reparse ensures correct entity extraction |
| Default branch only for webhook ingestion | Feature branch pushes ignored — only merges to default branch update the graph |
| Mongoose `returnDocument: 'after'` | Replaces deprecated `{ new: true }` in `findOneAndUpdate` calls |
| NATS at-least-once delivery | All event handlers are idempotent via `entityId` MERGE — safe to replay |
| Blast radius capped at 10 hops / 500 nodes | Prevents infinite traversal on circular dependency graphs |
