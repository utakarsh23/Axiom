# Services Reference

Detailed breakdown of every service in the platform — what it owns, what it does, and what it must never do.

---

## 1. Auth Service + NGINX

### Auth Service (port 8080)

**Role:** Handles GitHub OAuth and JWT issuance only. Not a proxy, not a router.

#### Owns
- GitHub OAuth flow (code exchange, access token, user profile fetch)
- JWT issuance and signing
- User records (MongoDB — `users` collection)
- Token verification endpoint (`GET /auth/verify`)

#### Does
- `GET /auth/github` — redirects to GitHub OAuth
- `GET /auth/github/callback` — exchanges code, creates/updates user, issues JWT
- `GET /auth/verify` — verifies JWT, returns `{ userId }` — called by NGINX `auth_request`
- `GET /auth/me` — returns current user profile from token

#### Does NOT
- Route or proxy any business traffic
- Talk to NATS
- Know anything about workspaces, repos, or code

> Auth Service is called only for login and token verification. It is never in the hot path of business requests.

---

### NGINX (port 80 / 443)

**Role:** Reverse proxy and routing layer. Replaces a Node.js API Gateway entirely.

#### Does
- Routes all client traffic to the correct downstream service by path prefix
- Uses `auth_request` directive to verify JWT via Auth Service on every protected route
- Injects `x-user-id` header from the `auth_request` response into proxied requests
- SSL termination, rate limiting, load balancing

#### Routing table
```
/auth/**           →  Auth Service       (8080)   — no auth_request (public)
/workspaces/**     →  Workspace Service  (9000)   — auth_request required
/search/**         →  Search Service     (9006)   — auth_request required
/docs/**           →  Doc Service        (9005)   — auth_request required
/ingest/**         →  Ingestion Service  (9001)   — auth_request required
/graph/**          →  Graph Service      (9002)   — auth_request required
/ci/**             →  CI/Vuln Service    (9007)   — auth_request required
```

#### Does NOT
- Contain any application logic
- Issue or parse JWTs directly
- Know anything about workspaces or users

> If Auth Service goes down, login and token verification fail — but all requests from users with valid existing JWTs continue uninterrupted through NGINX. No single point of failure for business traffic.

---

## 2. Workspace Service

**Role:** Manages tenancy. Knows which workspaces exist, which repos belong to them, who has access, and what coding standards the workspace enforces.

### Owns
- Workspace metadata (stored in MongoDB)
- Repository registration state
- User-to-workspace mappings
- GitHub installation IDs
- **Workspace Rulebook** — per-workspace coding standards and architecture constraints (stored in MongoDB, `rulebook` field on workspace document)

### Rulebook Schema
```json
{
  "naming": {
    "functions": "camelCase",
    "classes": "PascalCase",
    "files": "kebab-case",
    "constants": "UPPER_SNAKE_CASE"
  },
  "comments": {
    "requireJsDoc": true,
    "minCommentRatio": 0.1
  },
  "structure": {
    "maxFunctionLines": 50,
    "maxFileLines": 300,
    "forbiddenPatterns": ["console.log", "debugger", "TODO:"]
  },
  "architecture": {
    "forbiddenLayerAccess": [
      { "from": "controller", "to": "repository", "reason": "must go through service layer" }
    ]
  }
}
```
Rulebook is optional — if not defined, only default policy rules and Semgrep checks apply.

### Does
- Create, update, and delete workspaces
- Attach and detach repositories to a workspace
- Store GitHub App installation IDs for authenticated API access
- Create, update, and return the workspace rulebook (`GET/PUT /workspaces/:workspaceId/rulebook`)
- Emit `REPO_ADDED` to the message bus when a new repo is registered — this kicks off the cold start ingestion flow

### Does NOT
- Parse any code
- Read or write to the knowledge graph
- Generate embeddings
- Enforce the rulebook itself (CI Service does that)

> Workspace Service is the starting point of every ingestion flow, but it does none of the heavy lifting itself.

---

## 3. Ingestion Service — The Mutation Engine

**Role:** The core of the platform. Converts raw repository content into structured events that drive every downstream system.

### Owns
- GitHub API integration (tree fetch, file fetch, webhook handling)
- AST parsing layer (polyglot — supports multiple languages)
- Entity extraction logic (functions, classes, imports, calls, endpoints)
- Hash computation (signatureHash, bodyHash, callListHash)
- Diff computation between versions
- Event emission

### Does — Full Mode (Cold Start)
Triggered on `REPO_ADDED`.
1. Fetch the entire repository file tree via GitHub API
2. Fetch file contents using authenticated access
3. For each supported file:
   - Parse AST entirely in memory (AST is never persisted)
   - Extract: functions, classes, imports, call sites, endpoints
   - Compute: `signatureHash`, `bodyHash`, `callListHash` for each entity
4. Emit:
   - `ENTITY_CREATED` for each discovered entity
   - `RELATION_CREATED` for each discovered relationship
   - `EMBEDDING_REQUIRED` for entities that need vectorization

### Does — Diff Mode (Commit)
Triggered on `COMMIT_RECEIVED`.
1. Fetch the commit diff from GitHub
2. Identify which files changed
3. Re-parse the **entire** changed file (not just changed lines — partial AST is unreliable)
4. Extract entities from the fresh parse
5. Compare hashes against previously stored values
6. Emit only what changed:
   - `ENTITY_UPDATED` / `ENTITY_DELETED`
   - `RELATION_ADDED` / `RELATION_REMOVED`
   - `EMBEDDING_REQUIRED` for changed entities

### Does NOT
- Write directly to Neo4j
- Write to ChromaDB
- Call the LLM
- Generate documentation
- Persist raw ASTs

> Ingestion only emits structural truth. Every downstream mutation is a consequence of its events.

> **Parser quality (known issues):** Walker call extraction currently emits all call targets including builtins and prototype methods. `await axios.get` is stored verbatim instead of being collapsed to `axios`. `File` nodes and `DECLARES` edges not yet emitted. Graph hierarchy is currently flat (functions only, no file-level grouping).

---

## 4. Graph Service — Neo4j Owner

**Role:** The structural authority of the system. Maintains the temporal knowledge graph.

### Owns
- The entire Neo4j knowledge graph
- Temporal versioning logic (`validFrom`, `validTo`, `commitHash`)
- All Cypher query logic
- Impact traversal algorithms

### Node Types

| Node | Description |
|---|---|
| `Workspace` | Top-level tenant — all data scoped to this |
| `Repository` | A repo registered to a workspace |
| `File` | Source file within a repo |
| `Function` | Extracted function or method |
| `Class` | Extracted class |
| `Endpoint` | HTTP route (Express, FastAPI, etc.) |
| `ExternalService` | npm package, stdlib call target — not parsed, just a named node |

### Edge Types

| Edge | Meaning |
|---|---|
| `CALLS` | Function → Function (within workspace) |
| `CALLS_EXTERNAL` | Function → ExternalService (outside workspace) |
| `DECLARES` | File → Function / Class / Endpoint |
| `PART_OF` | File → Repository → Workspace |
| `IMPORTS` | File → File |

### Does
- Creates and MERGEs nodes in Neo4j by `entityId` (stable SHA-256 hash) when `ENTITY_CREATED` events arrive — idempotent
- Closes old versions of nodes/edges by setting `validTo` when an update or deletion event arrives
- Inserts new versions of nodes/edges with `validFrom` set to the new commit
- On `RELATION_ADDED`: checks if callee `name` exists in workspace → `CALLS` edge; if not → merge `ExternalService` node + `CALLS_EXTERNAL` edge
- Links entities across repositories within the same workspace via cross-repo `CALLS` edges
- Exposes workspace-scoped graph query API:
  - `GET /graph/:workspaceId` — full live graph for all repos in workspace
  - `GET /graph/:workspaceId/repo/:repoId` — scoped to a single repo
  - `GET /graph/:workspaceId/impact/:entityName` — blast radius (callers + callees, cross-repo, 10 hop / 500 node cap)
  - `GET /graph/:workspaceId/timeline?commit=abc123` — graph state at a specific commit

### Does NOT
- Parse code or fetch files from GitHub
- Generate embeddings
- Call the LLM
- Hard delete any node or edge — old versions are always closed, never removed

> The graph is append-versioned. Nothing is deleted outright — old versions are closed. This is what enables timeline queries and drift detection.
> Each workspace is fully isolated — all Cypher queries are always scoped by `workspaceId`.

---

## 5. Vector Service — Chroma Owner

**Role:** The semantic layer. Handles all embedding generation and similarity search.

### Owns
- ChromaDB instance
- Embedding generation pipeline
- Semantic similarity query logic

### Does
- Generates embeddings for entities when `EMBEDDING_REQUIRED` is received
- Upserts embeddings for new or updated entities
- Deletes embeddings for entities that have been removed
- Scopes every upsert and query to a `workspaceId` — no cross-workspace leakage
- Exposes raw vector query (`POST /vector/query`) returning top-K `entityId`s by cosine similarity — no NL processing, no LLM involvement

### Does NOT
- Accept or interpret natural-language queries (that is Search Service)
- Modify the knowledge graph
- Parse code
- Compute structural impact

> Vector Service answers "what is adjacent in embedding space?" It returns entityIds and scores. It does not explain anything.

---

## 6. LLM Service — The Analyst

**Role:** Fully stateless processor. Owns two separate model runtimes — one for language generation, one for embeddings. Receives pre-assembled structured context via HTTP and returns output. No databases, no NATS subscriptions, no persistent state.

### Owns

#### Model 1 — Generative LLM (Reasoning Engine)
- Type: 7B–13B decoder model, instruction fine-tuned (LoRA/QLoRA)
- Optimized for: structured reasoning, deterministic diff formatting, multi-hop context understanding
- Runtime: `src/llm/provider.ts` — swap the model here, nothing else changes
- Used by: `/llm/explain`, `/llm/patch`, `/llm/whatif`, `/llm/pr`
- This model **generates language and code**

#### Model 2 — Embedding Model (Semantic Engine)
- Type: 300M–1B encoder model, contrastive / triplet trained
- Optimized for: cosine similarity geometry, stable vector space, fast inference
- Runtime: `src/embeddings/provider.ts` — swap the model here, nothing else changes
- Used by: `/llm/embed`, called by Vector Service on `EMBEDDING_REQUIRED`
- This model **produces dense vectors only**

> Two models because the loss functions are fundamentally different: generative uses next-token prediction, embedding uses metric learning. Combining them degrades both.

### Does
- Generates plain-English explanations from assembled graph + vector context (`POST /llm/explain`)
- Generates what-if consequence reports from blast radius + semantic context (`POST /llm/whatif`)
- Generates unified diff patches for detected violations (`POST /llm/patch`)
- Generates PR descriptions with risk level, confidence score, and impact summary (`POST /llm/pr`)
- Generates embedding vectors for a given code snippet (`POST /llm/embed`)

### API
- `POST /llm/explain` — assembled context in, plain-English explanation out
- `POST /llm/whatif` — blast radius + semantic context in, consequence report out
- `POST /llm/patch` — violation context in, unified diff + risk score out
- `POST /llm/pr` — patch metadata in, PR description out
- `POST /llm/embed` — code snippet in, embedding vector out

### Does NOT
- Subscribe to any NATS events
- Own any database or persistent storage
- Call Graph Service, Vector Service, Doc Service, or any other service
- Apply patches or create PRs
- Make any decisions — it only processes what it is given

> LLM Service is a pure function over HTTP. One model thinks. One measures similarity. All orchestration lives in the callers.

---

## 7. Doc Service — Documentation Owner

**Role:** Owns entity documentation. Consumes ingestion events from NATS, assembles context, calls LLM Service to generate doc blocks, and persists them in its own MongoDB collection. Exposes a read API for retrieving docs by workspace or entity.

### Owns
- MongoDB collection `docBlocks`: `entityId`, `workspaceId`, `repoId`, `filePath`, `entityName`, `docBlock`, `generatedAt`, `commitHash`

### Does
- On `DOC_REQUIRED`: assemble context from event payload (entity code, call list) + optional 1-hop Graph Service call for callers → call `POST /llm/explain` → store result in MongoDB
- On `ENTITY_UPDATED`: regenerate doc block for the new entity version (overwrite)
- On `ENTITY_DELETED`: delete doc block for the entity
- Scopes all reads and writes to `workspaceId` — no cross-workspace leakage

### Events Consumed
- `DOC_REQUIRED` — generate + store new doc block
- `ENTITY_UPDATED` — regenerate doc block
- `ENTITY_DELETED` — delete doc block

### API
- `GET /docs/:workspaceId` — all doc blocks for a workspace
- `GET /docs/:workspaceId/entity/:entityId` — doc block for a specific entity

### Does NOT
- Generate LLM output itself (delegates all generation to LLM Service)
- Modify the knowledge graph
- Generate embeddings
- Handle user queries (that is Search Service)

> Doc Service is the async background worker for documentation. It runs independently of user queries and scales on its own without affecting LLM Service response latency.

---

## 8. Search Service — Query Orchestrator

**Role:** The user-facing query brain. Handles all RAG, what-if, and similarity queries. Owns zero databases — pure orchestration. It assembles context from the right data layers and hands off to LLM Service.

### Owns
- Query routing logic
- Context assembly for each query type
- Fan-out logic to Graph Service + Vector Service

### Does

#### RAG Queries — "What does this code do?"
1. Receive natural-language question + optional entity name
2. Call Vector Service (`POST /vector/query`) for top-K semantically similar code chunks
3. If entity name provided: call Graph Service for direct callers + callees
4. Assemble bounded context
5. Call LLM Service (`POST /llm/explain`) → return explanation

#### What-If Queries — "What happens if I change X?"
1. Receive entity name + description of proposed change
2. Call Graph Service blast radius: `GET /graph/:workspaceId/impact/:entityName`
   → upstream callers, downstream callees, impacted endpoints
3. Call Vector Service for similar implementations across workspace
4. Assemble structured context (graph impact + semantic patterns)
5. Call LLM Service (`POST /llm/whatif`) → return consequence report

#### Similarity Queries — "How many services have similar code?"
1. Receive code snippet or entity name
2. Call Vector Service (`POST /vector/query`) for top-K similar entities
3. Return raw result — no LLM involved

### API
- `POST /search/rag` — RAG query
- `POST /search/whatif` — what-if consequence query
- `GET /search/similar` — similarity search (no LLM)

### Does NOT
- Query Neo4j or ChromaDB directly
- Generate embeddings
- Propose or apply patches
- Mutate any state whatsoever

> Search Service only reads, assembles, and explains. Graph = computation. LLM = explanation. Search = orchestration.

---

## 9. CI / Vulnerability Service

**Role:** The enforcement layer. Runs a three-tier escalating check pipeline after every commit's graph update settles. Only escalates to LLM when lower tiers find something — keeping LLM cost bounded and accuracy high.

### Owns
- Default policy rule definitions
- Semgrep rule set + dependency audit integration
- Rulebook enforcement logic (fetches rulebook from Workspace Service per workspace)
- PR creation logic (branches, commits, GitHub API)

### Check Pipeline — Three-Tier Escalation

Runs after every commit's graph update settles.

**Tier 1 — Structural checks (Graph Service queries)**
- Circular dependency introduced?
- Service accessing forbidden layer (from workspace rulebook `architecture.forbiddenLayerAccess` or default policy)?
- Deprecated API used?
- Endpoint removed but still referenced?
- Cross-repo violation?

All Tier 1 checks are exact Cypher traversals via Graph Service API — zero false positives.

**Tier 2 — Code pattern + rulebook checks (run in parallel, on changed entity payloads)**

Tier 2a — Semgrep + dependency audit:
- Hardcoded secrets
- SQL injection risk
- Unsafe async patterns
- Dangerous `eval` usage
- Dependency vulnerabilities (`npm audit` / `pip audit` / `cargo audit`)

Tier 2b — Workspace Rulebook:
- Naming conventions — regex on entity names already in the graph
- JSDoc / comment presence — check entity code from event payload
- Forbidden patterns (`console.log`, `debugger`, etc.) — scan code string
- Max function / file line limits — check entity code length
- Architecture layer rules — graph query (same mechanism as Tier 1)

If rulebook is not defined for the workspace, Tier 2b is skipped.

**Tier 3 — LLM escalation (only if Tier 1 OR Tier 2 finds anything)**

CI Service assembles structured input and sends to LLM Service:
```json
{
  "findings": [
    { "source": "graph", "type": "circular_dependency", "path": ["A → B → C → A"] },
    { "source": "semgrep", "ruleId": "javascript.sql-injection", "line": 42, "code": "..." },
    { "source": "rulebook", "type": "naming_violation", "entity": "getUserdata", "expected": "camelCase" }
  ],
  "entityCode": "...",
  "callers": [],
  "callees": [],
  "similarSafePatterns": []
}
```

LLM (`POST /llm/patch`) returns: confirmed violations, severity, unified diff patch, risk score.

If no findings from Tier 1 and Tier 2 → stop. Clean commit. LLM is never called.

### Autonomous Patch Flow (after Tier 3 confirms violation)
1. Patch Simulation: apply patch in memory → AST reparse → projected entity/relation delta → Graph Service structural impact check
2. If unsafe → discard
3. If safe → create branch, apply patch, commit, push, open PR with full violation + fix description
4. Merge decision by risk level: `LOW` = auto-merge, `MEDIUM` = require review, `HIGH` = block + manual
5. After merge: standard `COMMIT_RECEIVED` flow — graph and vectors update normally

### Does NOT
- Parse AST directly (delegates reparsing to Ingestion Service parser)
- Write to the graph (graph only changes via ingestion events)
- Generate embeddings
- Call LLM on every commit — only when Tier 1 or Tier 2 produces findings

> CI Service coordinates enforcement — it never mutates the graph directly. Every fix flows through the standard commit path. LLM is a confirmation and reasoning layer, not a first-pass scanner.

---

## 10. Message Bus (NATS / Kafka)

**Role:** The backbone of the event-driven architecture. Decouples all services from each other.

### Owns
- Event propagation infrastructure
- Topic/subject routing

### Handles Events

| Event | Produced By | Consumed By |
|-------|------------|-------------|
| `REPO_ADDED` | Workspace Service | Ingestion Service |
| `COMMIT_RECEIVED` | Webhook handler | Ingestion Service |
| `ENTITY_CREATED` | Ingestion Service | Graph Service |
| `ENTITY_UPDATED` | Ingestion Service | Graph Service, Vector Service, Doc Service |
| `ENTITY_DELETED` | Ingestion Service | Graph Service, Vector Service, Doc Service |
| `RELATION_ADDED` | Ingestion Service | Graph Service |
| `RELATION_REMOVED` | Ingestion Service | Graph Service |
| `EMBEDDING_REQUIRED` | Ingestion Service | Vector Service |
| `DOC_REQUIRED` | Ingestion Service | Doc Service |

### Guarantees
- Event ordering within a topic
- At-least-once delivery with retry on consumer failure
- Loose coupling — producers never know who consumes their events

---

## Data Ownership Summary

| Service | Owns |
|---------|------|
| Workspace Service | MongoDB (`workspaces`, `repositories`, `rulebook` per workspace) |
| Ingestion Service | MongoDB (`entityHashes`) |
| Graph Service | Neo4j |
| Vector Service | ChromaDB |
| LLM Service | None (stateless — owns provider clients only) |
| Doc Service | MongoDB (`docBlocks`) |
| Search Service | None (pure orchestration) |
| CI / Vulnerability Service | None (rule engine + event triggers — fetches rulebook from Workspace Service) |

---

## Interaction Flow Map

### Cold Start
```
Workspace Service
  → [REPO_ADDED]
  → Ingestion Service (Full Mode)
  → [ENTITY_CREATED, RELATION_ADDED, EMBEDDING_REQUIRED, DOC_REQUIRED]
  → Graph Service (nodes + edges created, validFrom = initialCommit)
  → Vector Service (embeddings generated + upserted via LLM Service /llm/embed)
  → Doc Service (doc blocks generated via LLM Service /llm/explain + stored in MongoDB)
```

### Commit
```
GitHub Webhook
  → [COMMIT_RECEIVED]
  → Ingestion Service (Diff Mode)
  → [ENTITY_UPDATED/DELETED, RELATION_ADDED/REMOVED, EMBEDDING_REQUIRED, DOC_REQUIRED]
  → Graph Service (version close → validTo, new version → validFrom)
  → Vector Service (re-embed changed, delete removed)
  → Doc Service (regenerate changed docs, delete removed docs)
```

### Autonomous Fix
```
[After every commit graph update]
CI / Vulnerability Service:
  → [Tier 1] Structural checks (Graph Service Cypher queries)
  → [Tier 2a] Semgrep + dep audit on changed entity payloads
  → [Tier 2b] Rulebook checks (fetch from Workspace Service, regex + graph queries)
  → Any findings from Tier 1 OR Tier 2?
      ↓ NO  → Stop. Clean commit.
      ↓ YES
  → [Tier 3] Assemble structured findings + bounded context
      → LLM Service (POST /llm/patch) → confirmed violations + unified diff + risk level
      → Patch Simulation:
          - Apply in memory
          - Reparse file (AST)
          - Projected entity/relation delta
          - Graph Service: simulate structural impact
      → If unsafe: discard
      → If safe: create branch → apply → commit → push → open PR
      → Merge by risk: LOW=auto, MEDIUM=review, HIGH=block
      → After merge: COMMIT_RECEIVED → standard flow
```

### RAG Query
```
User: "What does this function do?"
  → Search Service
      → Vector Service (POST /vector/query) → top-K entityIds
      → Graph Service (callers + callees for named entity)
      → Assemble bounded context
      → LLM Service (POST /llm/explain)
  → Plain-English explanation
```

### What-If Query
```
User: "What happens if I change X?"
  → Search Service
      → Graph Service (GET /graph/:workspaceId/impact/:entityName)
        → blast radius: upstream callers, downstream callees, impacted endpoints
      → Vector Service (POST /vector/query) → similar implementations
      → Assemble structured context
      → LLM Service (POST /llm/whatif)
  → Consequence report: what breaks, what is affected, risk level
```

### Similarity Query
```
User: "How many services have similar code?"
  → Search Service
      → Vector Service (POST /vector/query) → top-K similar entities
  → Raw result: entity names, repos, similarity scores (no LLM)
```

### Impact Analysis
```
User selects entity
  → Graph Service (CALLS traversal → blast radius)
  → LLM Service (POST /llm/explain) → consequence explanation
```

---

## Critical Rules

1. **Only Ingestion produces structural truth.** No other service decides what entities or relations exist.
2. **Only Graph Service mutates the graph.** All writes to Neo4j go through this service.
3. **Only Vector Service mutates embeddings.** All writes to Chroma go through this service.
4. **LLM never directly mutates system state.** It proposes — simulation and PR flow enforce safety.
5. **No service reads another service's database directly.** All cross-service communication is via API or message bus.

---

## What This Architecture Gives You

- **Horizontal scalability** — each service scales independently
- **Service isolation** — a failure in Vector Service does not break Graph Service
- **Clear failure domains** — every bug has a single owner
- **Auditability** — every mutation is traceable to an event
- **Deterministic mutation path** — state only changes via ingestion events, never ad hoc
