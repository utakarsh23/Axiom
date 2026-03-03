# Axiom — Engineering Intelligence Platform

## Core Principle

- **Repository** = Source of Truth
- **Graph** = Structural model of system
- **Vector DB** = Semantic index
- **AST** = Transient structural extractor
- **Generative LLM** = Analyst + Proposer (never direct mutator)
- **Embedding Model** = Similarity engine (vectors only, never text)

All state changes flow through Ingestion.

---

## LLM Architecture

LLM Service owns two separate model runtimes. They are never combined.

### Model 1 — Generative LLM (Reasoning Engine)
- **Type:** 7B–13B decoder, instruction fine-tuned (LoRA/QLoRA)
- **Optimized for:** structured reasoning, deterministic diff output, multi-hop context
- **Loss function:** next-token prediction
- **Runtime:** `src/llm/provider.ts`
- **Used by:** `/llm/explain`, `/llm/patch`, `/llm/whatif`, `/llm/pr`
- Generates language and code

### Model 2 — Embedding Model (Semantic Engine)
- **Type:** 300M–1B encoder, contrastive / triplet trained
- **Optimized for:** cosine similarity geometry, stable vector space, fast inference
- **Loss function:** metric learning
- **Runtime:** `src/embeddings/provider.ts`
- **Used by:** `/llm/embed` — called by Vector Service on `EMBEDDING_REQUIRED`
- Produces dense vectors only

> Two models because the loss functions are fundamentally different. Combining them degrades both.

---

## Services

| # | Service | Responsibility |
|---|---------|---------------|
| 1 | API Gateway | Entry point for all external requests |
| 2 | Workspace Service | Manages workspace + repo registration |
| 3 | Ingestion Service | Parses repos, emits events |
| 4 | Graph Service | Owns Neo4j |
| 5 | Vector Service | Owns ChromaDB — embedding storage and retrieval |
| 6 | LLM Service | Stateless analyst — explanation, patch generation, embedding generation |
| 7 | Doc Service | Owns doc blocks — generates and stores entity documentation |
| 8 | Search Service | Orchestrates RAG, what-if, and similarity queries |
| 9 | CI / Vulnerability Service | Scans, enforces policy, triggers autonomous patch flow |
| 10 | Message Bus | NATS or Kafka |

Each service owns its storage. No cross-service direct DB access.

---

## Data Models

### Neo4j (Knowledge Graph)

**Nodes:** `Workspace`, `Repository`, `File`, `Function`, `Endpoint`, `ExternalService`, `ADR`, `Incident`

**Edges:** `PART_OF`, `DECLARES`, `CALLS`, `CALLS_EXTERNAL`, `IMPORTS`, `CALLS_API`, `DEPENDS_ON`, `EXPOSES`, `BELONGS_TO_WORKSPACE`

> `CALLS` — between two known entities within the workspace  
> `CALLS_EXTERNAL` — from a workspace entity to an `ExternalService` node (npm package, stdlib, etc.)

Every node and edge carries:
- `workspaceId`
- `repoId`
- `validFrom`
- `validTo`
- `commitHash`

Temporal graph is required.

### MongoDB (Workspace Service)

- Workspace metadata
- Repository tracking
- Ingestion job state
- Optional AST metadata (hashes only, not raw AST)

### MongoDB (Ingestion Service)

- Entity hashes (`signatureHash`, `bodyHash`, `callListHash`) for diff computation
- No raw ASTs persisted

### MongoDB (Doc Service — doc blocks)

- Auto-generated documentation blocks per entity
- Fields: `entityId`, `workspaceId`, `repoId`, `filePath`, `entityName`, `docBlock`, `generatedAt`, `commitHash`
- One doc block per active entity version — overwritten on `ENTITY_UPDATED`, deleted on `ENTITY_DELETED`

### Vector DB (Chroma)

- Function embeddings
- Snippets
- Metadata: `workspaceId`, `entityId`

Only embed meaningful entities.

---

## Ingestion Flows

### Cold Start (Full Mode)

```
User adds repo
→ Workspace Service registers repo
→ Emit REPO_ADDED
→ Ingestion Service (FULL MODE):
    - Fetch repo tree via GitHub API
    - Fetch files (authenticated)
    - For each supported file:
        - Parse AST (in memory)
        - Extract: Functions, Classes, Imports, Calls, Endpoints
        - Compute: signatureHash, bodyHash, callListHash
        - Emit: ENTITY_CREATED, RELATION_ADDED, EMBEDDING_REQUIRED, DOC_REQUIRED
→ Graph Service: Create nodes + edges, set validFrom = initialCommit
→ Vector Service: Generate embeddings, upsert vectors
→ Doc Service: Generate doc blocks, store in MongoDB
```

### Commit Flow (Diff Mode)

```
GitHub Webhook
→ Emit COMMIT_RECEIVED
→ Ingestion Service (DIFF MODE):
    - Fetch commit diff
    - Identify changed files
    - Reparse whole changed file (not diff lines)
    - Extract entities
    - Compare hashes with previous version
    - Emit: ENTITY_UPDATED, ENTITY_DELETED, RELATION_ADDED, RELATION_REMOVED, EMBEDDING_REQUIRED, DOC_REQUIRED
→ Graph Service: Close old versions (validTo), insert new nodes/edges (validFrom)
→ Vector Service: Re-embed changed, remove deleted
→ Doc Service: Regenerate doc blocks for changed entities, delete docs for removed entities
```

No full rebuild on commit.

### Autonomous Patch Flow

**Step 1 — Commit arrives, system reflects structural truth:**
```
GitHub → COMMIT_RECEIVED
→ Ingestion Service (Diff Mode): AST parse, entity + relation delta emitted
→ Graph Service: temporal graph updated (validTo closed, validFrom inserted)
→ Vector Service: embeddings updated
```

**Step 2 — CI / Vulnerability Scan (runs after graph update):**

Structural checks (graph-based):
- Circular dependency introduced?
- Service accessing forbidden layer?
- Deprecated API used?
- Endpoint removed but still referenced?
- Cross-repo violation?

Code pattern checks:
- Hardcoded secrets? Missing error handling? Unsafe async?
- SQL injection risk? Dangerous eval? Dependency vulnerability?

If no violation → stop. If violation found → proceed.

**Step 3 — Context Assembly:**

CI Service assembles bounded context and sends to LLM Service:
- Target function code
- Direct callers and callees
- Impacted endpoints
- Relevant schema (if any)
- Similar safe implementations from Vector Service (optional)

Never the entire graph.

**Step 4 — Patch Proposal:**

LLM Service (`POST /llm/patch`) generates:
- Unified diff patch
- Risk explanation
- Expected structural impact
- Confidence score (LOW / MEDIUM / HIGH)

No mutation yet.

**Step 5 — Patch Simulation (Safety Gate):**
```
1. Apply patch in memory
2. Reparse modified file via AST (Ingestion Service parser)
3. Compute projected entity + relation delta
4. Graph Service simulates structural impact
```
Validate: no new circular dependency, no endpoint removal, no critical blast radius increase, no policy violation introduced.

If unsafe → discard. If safe → proceed.

**Step 6 — Automated PR Creation:**
```
CI / Vulnerability Service:
1. Create new branch from default
2. Apply patch, commit, push
3. Open Pull Request with: violation description, patch explanation,
   impact summary, risk level, confidence score
```
No direct modification to main branch.

**Step 7 — Merge decision by risk policy:**

| Risk Level | Action |
|---|---|
| LOW | Auto-merge |
| MEDIUM | Require review |
| HIGH | Block + manual review |

**Step 8 — After merge:**
```
GitHub fires new COMMIT_RECEIVED
→ Ingestion runs again → Graph updates → Vector updates
```
Structural state changes only through ingestion. Every fix is auditable.

LLM never directly mutates the graph.

---

## Event Types

```
REPO_ADDED
COMMIT_RECEIVED
ENTITY_CREATED
ENTITY_UPDATED
ENTITY_DELETED
RELATION_ADDED
RELATION_REMOVED
EMBEDDING_REQUIRED
DOC_REQUIRED
```

All mutation flows from these events.

---

## RAG — Code Explanation

**"What does this function do / what is this code doing?"**

```
User question (+ optional entity name)
→ Search Service:
    1. Vector Service: top-K semantically similar code chunks
    2. Graph Service (if entity named): direct callers + callees
    3. Assemble bounded context
    4. LLM Service (POST /llm/explain): plain-English explanation
→ Response
```

Vector = semantic relevance. Graph = structural truth.

---

## What-If Queries

**"What happens if I change X / replace Y with Z / use this instead?"**

```
User query + entity name + proposed change description
→ Search Service:
    1. Graph Service: blast radius (GET /graph/:workspaceId/impact/:entityName)
       → upstream callers, downstream callees, impacted endpoints
    2. Vector Service: similar implementations across workspace
    3. Assemble structured context (graph impact + semantic patterns)
    4. LLM Service (POST /llm/whatif): consequence report
→ Structured response: what breaks, what is affected, risk level
```

Graph = computation. LLM = explanation. Search Service = orchestration only.

---

## Similarity Queries

**"How many services have similar code to this?"**

```
User query or code snippet
→ Search Service:
    1. Vector Service: top-K similar entities (cosine similarity, no LLM)
→ Raw result: entity names, repos, similarity scores
```

---

## Impact Analysis

```
User selects entity
→ Graph Service: Traverse CALLS + reverse CALLS → blast radius → impacted endpoints
→ LLM Service: Convert structural output into explanation
```

---

## Timeline Support

Every node/edge: `validFrom`, `validTo`, `commitHash`

- Filter entities valid at any given commit
- Supports rewind and drift detection

---

## Multi-Repo Workspace

- Cross-repo `CALLS` edges supported — functions calling across service boundaries within the same workspace are linked directly
- `CALLS_EXTERNAL` edge created when a call target is not found in any repo in the workspace (npm packages, stdlib)
- `ExternalService` node created/merged per external dependency — not a parsed entity, just a named call target
- Cross-repo impact analysis required
- Each workspace is fully isolated — no cross-workspace data leakage

## Graph Query API

Exposed by Graph Service, routed via API Gateway:

```
GET /graph/:workspaceId                          — full live graph (all repos in workspace)
GET /graph/:workspaceId/repo/:repoId             — scoped to a single repo
GET /graph/:workspaceId/impact/:entityName       — blast radius traversal (callers + callees)
GET /graph/:workspaceId/timeline?commit=abc123   — graph state at a specific commit
```

Frontend visualizes the workspace graph using **React Flow**.

---

## LLM Context Building

Never send full graph. Send only:
- Target function code
- Direct callers
- Direct callees
- Endpoint exposure
- Relevant schema
- Optional semantic matches

Minimal bounded context.

---

## Performance Strategy

- Parse O(n) per file
- Reparse entire changed file on commit (not diff lines)
- Batch Neo4j writes
- Do not persist large raw ASTs
- Rate-limit GitHub API
- Skip files above size threshold
- Ignore generated/minified files
- Do not re-embed unchanged entities

---

## Security

- GitHub App authentication (preferred)
- Workspace-scoped queries only
- No cross-workspace data leakage
- PR-based patching only
- LLM cannot directly mutate graph

---

## What You Do NOT Do

- Do not store raw AST in Neo4j
- Do not let LLM directly mutate graph
- Do not rebuild full repo on every commit
- Do not send entire graph to LLM
- Do not mix service data ownership

---

## Final System Flow Summary

| Trigger | Flow |
|---------|------|
| Cold Start | Workspace → Ingestion (Full) → Graph + Vector + Doc Service |
| Commit | Webhook → Ingestion (Diff) → Graph Patch + Vector Patch + Doc Service (regen) |
| Autonomous Fix | Ingestion → CI Scan → LLM Patch → Simulation → PR → Merge → Standard Flow |
| RAG Query | Search → Vector (top-K) + Graph (callers/callees) → LLM → Response |
| What-If Query | Search → Graph (blast radius) + Vector (similar) → LLM → Consequence Report |
| Similarity | Search → Vector (top-K) → Raw Result |
| Impact Analysis | Graph (blast radius) → LLM → Explanation |

---

## What This Is

A distributed, event-driven, versioned engineering intelligence platform with:

- Polyglot parsing
- Temporal graph modeling
- Cross-repo impact detection
- Semantic search
- Autonomous patch proposals
- CI enforcement
- Multi-tenant isolation

Infrastructure-grade software.
