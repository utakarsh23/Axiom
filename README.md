# Axiom

**Distributed, event-driven engineering intelligence platform** that transforms repositories into a temporal knowledge graph — with semantic indexing, autonomous policy enforcement, and LLM-assisted patch proposals.

---

## What is Axiom?

Axiom connects to your GitHub repositories and builds a living, queryable model of your entire codebase. Every commit updates a **temporal knowledge graph** in Neo4j, re-embeds changed code in ChromaDB, regenerates documentation, and runs a three-tier enforcement pipeline — automatically, with no manual steps.

Ask it:
- *"What does this function do?"* — RAG over your actual code
- *"What breaks if I change X?"* — blast radius traversal across all repos in the workspace
- *"Which services have similar implementations?"* — semantic similarity, no LLM required

When it finds a violation, it proposes a patch, simulates the structural impact, and opens a PR. You review or it auto-merges — depending on risk level.

---

## Architecture

```
                       ┌──────────────────────────────┐
                       │          NGINX (Port 80)      │
                       │   Reverse proxy + JWT verify  │
                       └───────────────┬──────────────┘
                                       │
         ┌─────────────┬───────────────┼──────────────┬──────────────┐
         ▼             ▼               ▼              ▼               ▼
   Auth (8080)  Workspace (9000)  Ingest (9001)  Graph (9002)  Search (9006)
                       │               │               │
                       │         NATS Message Bus      │
                       │      ┌────────┴────────┐      │
                       │      ▼                 ▼      │
                     Vector (9003)          Doc (9005)  │
                       │                               │
                     LLM (9004) ◄──────────────────────┘
                                        ▲
                               CI/Vuln (9007)
```

NGINX is the only service exposed to the internet. Every protected request is JWT-verified via `auth_request` before being proxied. All other services are on a Docker internal network — unreachable from outside.

---

## Services

| # | Service | Port | Owns | Responsibility |
|---|---------|------|------|----------------|
| 1 | Auth Service | 8080 | MongoDB `users` | GitHub OAuth, JWT issuance, token verification for NGINX |
| 2 | Workspace Service | 9000 | MongoDB `workspaces`, `repos` | Tenancy, repo registration, GitHub App install, workspace rulebooks |
| 3 | Ingestion Service | 9001 | MongoDB `entityHashes` | AST parsing, entity extraction, hash diff, event emission |
| 4 | Graph Service | 9002 | Neo4j | Temporal knowledge graph — the structural authority |
| 5 | Vector Service | 9003 | ChromaDB | Embedding upsert, deletion, cosine similarity search |
| 6 | LLM Service | 9004 | None (stateless) | Explanation, patch generation, PR descriptions, embedding vectors |
| 7 | Doc Service | 9005 | MongoDB `docBlocks` | Auto-generated, always-fresh entity documentation |
| 8 | Search Service | 9006 | None (orchestrator) | RAG, what-if, similarity — pure HTTP orchestration |
| 9 | CI/Vuln Service | 9007 | None (rule engine) | Structural checks, Semgrep, rulebook enforcement, autonomous PR flow |
| 10 | NATS | — | — | Event backbone — decouples all services |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (Node.js, CommonJS) |
| HTTP Framework | Express 5 |
| Graph Database | Neo4j (Cypher) |
| Vector Database | ChromaDB |
| Document Store | MongoDB via Mongoose |
| Message Bus | NATS |
| AST Parsing | `web-tree-sitter@0.20.8` WASM — 9 languages |
| Frontend | TypeScript + React Flow |
| Container Orchestration | Docker Compose |
| Reverse Proxy | Nginx |
| Code Scanning | Semgrep + `npm audit` |
| GitHub Integration | `@octokit/auth-app`, `@octokit/rest` |
| Logging | Pino (structured JSON) |

---

## Supported Languages

TypeScript · JavaScript · Python · Java · C · C++ · Go · Rust · Solidity

---

## Core Concepts

### Temporal Knowledge Graph

Every node and edge in Neo4j carries `validFrom`, `validTo`, and `commitHash`. Nothing is ever hard-deleted — old versions are closed by setting `validTo`. This gives you:

- Full graph state at any historical commit
- Structural drift detection between commits
- Complete audit trail of every change

### Deterministic Entity Identity

Every code entity gets a stable `entityId` — SHA-256 of `workspaceId:repoId:filePath:entityName`, first 24 chars. The same function always gets the same ID regardless of which commit produced it. This makes all upserts across Graph, Vector, and Doc idempotent.

### Event-Driven Mutation

All state changes flow through Ingestion. No other service decides what entities or relations exist. Graph Service, Vector Service, and Doc Service only react to NATS events — they never pull from GitHub or parse code themselves.

### Two Separate LLM Model Runtimes

LLM Service owns two completely separate runtimes:

- **Generative model** (7B–13B decoder, LoRA fine-tuned) — explanation, patch generation, PR descriptions. Loss: next-token prediction.
- **Embedding model** (300M–1B encoder, contrastive trained) — dense vectors only. Loss: metric learning.

Swapping either model means changing one file (`src/llm/provider.ts` or `src/embeddings/provider.ts`). Nothing else changes. They are never combined — different loss functions mean combining degrades both.

### Semantic Layer — Vector Service and RAG

Parallel to the graph, every code entity also lives as a **dense vector** in ChromaDB. When Ingestion emits `EMBEDDING_REQUIRED`, Vector Service calls the LLM Service embedding model and upserts the result — scoped to the workspace. On `ENTITY_UPDATED`, the vector is replaced. On `ENTITY_DELETED`, it is removed. The vector store is always in sync with the graph.

This semantic layer powers the RAG (Retrieval-Augmented Generation) flow:

```
User asks: "What does this code do?"
  → Search Service calls Vector Service (POST /vector/query)
      Converts query to embedding → cosine similarity search in ChromaDB
      Returns top-K entityIds ranked by semantic closeness
  → Search Service calls Graph Service for each result
      Fetches direct callers + callees (structural context)
  → Assembles bounded context: matched code + graph neighbourhood
  → Calls LLM Service (POST /llm/explain)
  → Returns plain-English explanation grounded in your actual codebase
```

The key distinction: **Vector = semantic relevance** (what is this about?), **Graph = structural truth** (what does this call, what calls this?). Neither alone is sufficient — RAG uses both.

---

## Knowledge Graph Model

### Node Types

| Node | Description |
|---|---|
| `Function` | Extracted function or method |
| `Class` | Extracted class |
| `Endpoint` | HTTP route (Express, FastAPI, etc.) |
| `ExternalService` | npm package or stdlib call target — named node, not parsed |

All internal nodes carry: `entityId`, `name`, `filePath`, `repoId`, `workspaceId`, `kind`, `language`, `validFrom`, `validTo`, `commitHash`

### Edge Types

| Edge | Meaning |
|---|---|
| `CALLS` | Function → Function (both are known workspace entities) |
| `CALLS_EXTERNAL` | Function → ExternalService (callee not found in any workspace repo) |
| `API_CALL` | Endpoint → Endpoint (matched across services by route pattern) |

---

## Ingestion Flows

### Cold Start — Full Mode

Triggered once when a repo is registered.

```
POST /workspaces/:id/repos
  → Workspace Service stores repo, publishes REPO_ADDED
  → Ingestion Service:
      Resolves HEAD commit SHA via GitHub API
      Fetches full repo file tree
      For each supported file:
        Fetch content → parse AST in memory → extract entities + calls
        Compute signatureHash, bodyHash, callListHash
        Diff against empty state → everything is ENTITY_CREATED
        Emit: ENTITY_CREATED, RELATION_ADDED, EMBEDDING_REQUIRED, DOC_REQUIRED
        Upsert hashes + call lists to MongoDB
  → Graph Service:   MERGE nodes by entityId, create edges, validFrom = HEAD
  → Vector Service:  generate + upsert embeddings
  → Doc Service:     generate + store doc blocks
```

### Incremental — Diff Mode

Triggered on every push to the default branch.

```
GitHub push event → POST /ingest/webhook/github
  → HMAC-SHA256 verified → 200 acked immediately
  → COMMIT_RECEIVED published to NATS
  → Ingestion Service:
      Fetch changed files for commit
      Re-parse entire changed file (not diff lines)
      Compare hashes against stored state
      Emit only delta:
        ENTITY_UPDATED / ENTITY_DELETED
        RELATION_ADDED / RELATION_REMOVED
        EMBEDDING_REQUIRED / DOC_REQUIRED
      Update MongoDB hash store
  → Graph Service:   close old versions (validTo), insert new (validFrom)
  → Vector Service:  re-embed changed, delete removed
  → Doc Service:     regenerate changed docs, delete removed
```

---

## Autonomous Patch Flow

Runs automatically after every commit's graph update settles.

```
Tier 1 — Structural checks (zero false positives, deterministic Cypher queries)
  Circular dependency introduced?
  Deprecated API still called?
  Removed entity still referenced?
  Forbidden layer access (rulebook architecture rules)?

Tier 2 — Code pattern + Rulebook (parallel)
  Semgrep:  hardcoded secrets · SQL injection · unsafe async · dangerous eval
  npm audit: known CVEs in dependencies
  Rulebook: naming conventions · JSDoc presence · forbidden patterns · line limits

Gate: No findings → Stop. LLM never called.
      Findings → Proceed to Tier 3.

Tier 3 — LLM confirmation + patch proposal
  Assembled findings + entity code + callers + callees → POST /llm/patch
  Returns: confirmed violations · unified diff · risk score (LOW / MEDIUM / HIGH)

Simulation gate
  Apply patch in memory → reparse AST → projected entity/relation delta
  Graph Service structural impact check
  Discard if: HIGH risk + HIGH severity · destructive keywords · blast radius > 20 · active cycles

PR creation (if simulation passes)
  Create branch → apply patch → commit → push → open Pull Request

Merge policy
  LOW     → auto-merge
  MEDIUM  → require human review
  HIGH    → block, manual review only

After merge → COMMIT_RECEIVED → standard ingestion → graph + vectors update normally
```

---

## Query APIs

### Graph Service
```
GET /graph/:workspaceId                         — full live graph (all repos)
GET /graph/:workspaceId/repo/:repoId            — scoped to single repo
GET /graph/:workspaceId/impact/:entityName      — blast radius, 10 hops, 500 node cap
GET /graph/:workspaceId/timeline?commit=sha     — graph state at any historical commit
```

### Search Service
```
POST /search/rag       — RAG: natural language → Vector (top-K) + Graph (callers/callees) + LLM
POST /search/whatif    — What-if: Graph blast radius + Vector similar patterns + LLM consequence report
GET  /search/similar   — Similarity: Vector cosine search, no LLM
```

### Vector Service
```
POST /vector/query     — top-K similar entities; accepts NL query or raw code snippet
```

### Doc Service
```
GET /docs/:workspaceId                     — all doc blocks for workspace
GET /docs/:workspaceId/entity/:entityId    — doc block for specific entity
```

---

## NATS Events

| Event | Produced By | Consumed By |
|---|---|---|
| `REPO_ADDED` | Workspace Service | Ingestion Service |
| `COMMIT_RECEIVED` | Webhook handler | Ingestion Service |
| `ENTITY_CREATED` | Ingestion Service | Graph Service, CI/Vuln Service |
| `ENTITY_UPDATED` | Ingestion Service | Graph Service, Vector Service, Doc Service, CI/Vuln Service |
| `ENTITY_DELETED` | Ingestion Service | Graph Service, Vector Service, Doc Service |
| `RELATION_ADDED` | Ingestion Service | Graph Service |
| `RELATION_REMOVED` | Ingestion Service | Graph Service |
| `EMBEDDING_REQUIRED` | Ingestion Service | Vector Service |
| `DOC_REQUIRED` | Ingestion Service | Doc Service |

---

## Workspace Rulebook

Optional per-workspace coding standards, enforced automatically by CI/Vuln Service on every commit.

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

Set via `PUT /workspaces/:workspaceId/rulebook`. If not set, only default policy and Semgrep checks run.

---

## Getting Started

See [INITIALIZATION.md](./INITIALIZATION.md) for full setup instructions.

```bash
git clone https://github.com/utakarsh23/Axiom.git
cd Axiom
cp .env.example .env   # fill in required variables
docker compose up --build
```

Frontend: `http://localhost`

---

## Project Structure

```
Axiom/
├── backend/
│   ├── auth-service/              # GitHub OAuth + JWT
│   ├── workspace-service/         # Tenancy + repo registration + rulebook
│   ├── ingestion-service/         # AST parsing + diff + event emission
│   ├── graph-service/             # Neo4j temporal knowledge graph
│   ├── vector-service/            # ChromaDB embedding store
│   ├── llm-service/               # Generative + embedding model runtimes
│   ├── documentation-service/     # Auto-generated entity doc blocks
│   ├── search-service/            # RAG + what-if + similarity orchestration
│   └── ci-vuln-service/           # Enforcement + autonomous PR flow
├── frontend/                      # React Flow interactive call graph
├── nginx/                         # Reverse proxy config
├── docker-compose.yml
├── database.md                    # Neo4j schema reference
├── CHANGELOG.md                   # Per-service changelog
└── INITIALIZATION.md              # Setup and local dev guide
```

---

## User Flow

### First-time setup
```
1. Sign in with GitHub OAuth → JWT issued → stored in frontend
2. Create a workspace
3. Install the GitHub App on your account/org → link installationId to workspace
4. Add a repo → cold start ingestion runs automatically
   Graph populated · embeddings generated · doc blocks created
```

### Day-to-day usage
```
5. Push code → GitHub webhook fires → diff ingestion runs automatically
   Only changed entities re-processed · graph versioned · vectors updated · docs refreshed

6. Open the graph view → interactive React Flow call graph
   Click a file → expands its functions and endpoints
   Click a function → expands its callers and callees
   Cross-repo CALLS edges visible inline

7. Search: "What does verifyToken do?"
   → RAG query → top-K similar entities + graph neighbourhood → LLM explanation

8. Search: "What breaks if I change getUserById?"
   → What-if query → blast radius traversal + similar patterns → consequence report

9. Violation detected automatically after a commit
   → CI/Vuln pipeline runs → Tier 1 + Tier 2 checks → LLM patch proposed
   → Simulation passes → PR opened automatically
   → LOW risk: auto-merged · MEDIUM: review required · HIGH: blocked
```

### Returning to history
```
10. View graph at any past commit
    GET /graph/:workspaceId/timeline?commit=<sha>
    Compare structure before and after any change
```

---

## Architecture Invariants

1. **Only Ingestion produces structural truth.** No other service decides what entities or relations exist.
2. **Only Graph Service writes to Neo4j.** All graph mutations go through this service.
3. **Only Vector Service writes to ChromaDB.** All embedding mutations go through this service.
4. **LLM never directly mutates system state.** It proposes — simulation and the PR flow enforce safety.
5. **No service reads another service's database directly.** All cross-service communication is via HTTP or NATS.

---

## Known Limitations

- **Noisy call extraction** — builtins and prototype methods (`map`, `filter`, `forEach`, `toString`, etc.) are currently emitted as `CALLS_EXTERNAL` targets. A blocklist filter is planned at the walker layer.
- **Member calls stored verbatim** — `await axios.get` stored as literal callee name instead of collapsing to an `axios` ExternalService node.
- **No `File` node or `DECLARES` edges** — graph hierarchy is currently flat (functions only, no file-level grouping). Planned for next walker pass.
- **`workspaceId` missing in webhook** — GitHub webhook payloads don't carry Axiom IDs. Currently forwarded as empty strings; lookup via Workspace Service is planned.

---

## Author

**Utkarsh** — [github.com/utakarsh23](https://github.com/utakarsh23)