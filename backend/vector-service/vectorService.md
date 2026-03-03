# Vector Service

The semantic storage layer of Axiom. Owns ChromaDB entirely. Handles all embedding generation and similarity search. Never interprets meaning — it stores vectors, retrieves vectors, and returns raw results.

---

## Responsibilities

- Consumes `EMBEDDING_REQUIRED`, `ENTITY_UPDATED`, `ENTITY_DELETED` from NATS
- Calls LLM Service `/llm/embed` to generate vectors — never runs inference itself
- Upserts and deletes embeddings in ChromaDB
- Exposes `POST /vector/query` — cosine similarity search, returns top-K entityIds + scores + metadata + raw code
- Scopes every read and write to `workspaceId` — no cross-workspace leakage

This service **never** interprets queries, calls the LLM for reasoning, or modifies the knowledge graph.

---

## Why Vector Service Does Not Generate Embeddings Itself

The embedding model lives in LLM Service (`src/embeddings/provider.ts`). Vector Service calls `POST /llm/embed` to get the vector, then stores it. This keeps the model runtime in one place — when the fine-tuned embedding model is swapped in, only LLM Service changes. Vector Service is unaffected.

---

## Events Consumed

| Event | Action |
|---|---|
| `EMBEDDING_REQUIRED` | Fetch vector from LLM Service → upsert to Chroma |
| `ENTITY_UPDATED` | Re-fetch vector → upsert (Chroma overwrites on matching id) |
| `ENTITY_DELETED` | Delete vector from Chroma by entityId |

No `ENTITY_CREATED` subscription — Ingestion always emits `EMBEDDING_REQUIRED` alongside `ENTITY_CREATED`. Subscribing to both would double-embed every new entity.

---

## Query API

### `POST /vector/query`

Takes a query string (natural language or raw code snippet) and returns the top-K most semantically similar entities from the workspace.

**Request:**
```json
{
  "workspaceId": "ws-abc123",
  "query": "function that validates JWT tokens",
  "topK": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "entityId": "ent-xyz",
      "score": 0.94,
      "metadata": {
        "entityName": "verifyToken",
        "kind": "function",
        "language": "typescript",
        "filePath": "src/auth/middleware.ts",
        "repoId": "repo-123",
        "workspaceId": "ws-abc123"
      },
      "code": "function verifyToken(token: string) { ... }"
    }
  ]
}
```

The `query` field accepts both natural-language questions and raw code snippets — the embedding model handles both. The distinction is irrelevant to Vector Service; Search Service decides which form to pass.

**Score:** `1 - cosine_distance`. Range 0–1. Higher = more similar. Collection is configured with `hnsw:space: cosine` to ensure this formula is valid.

---

## ChromaDB Layout

One collection per workspace: `workspace-{workspaceId}`

Each document stored with:
- `id` — `entityId` (unique per entity)
- `embedding` — dense vector from LLM Service embedding model
- `document` — raw source code of the entity
- `metadata` — `entityId`, `workspaceId`, `repoId`, `filePath`, `entityName`, `kind`, `language`

---

## Source Structure

```
src/
  index.ts                  — entry point: boots Chroma, NATS, HTTP server
  config.ts                 — typed config from env vars
  logger.ts                 — pino structured logger

  db/
    client.ts               — ChromaDB client: connect, getOrCreateCollection (cosine space)

  events/
    subscriber.ts           — NATS subscriber: routes embedding events to handlers

  handlers/
    embedding.ts            — EMBEDDING_REQUIRED, ENTITY_UPDATED, ENTITY_DELETED handlers

  services/
    vectorService.ts        — query logic, input validation, fetchQueryEmbedding

  api/
    router.ts               — Express routing only, delegates to vectorService
```

---

## Environment Variables

```env
CHROMA_URL=http://localhost:8000
NATS_URL=nats://localhost:4222
LLM_SERVICE_URL=http://localhost:9004
PORT=9003
LOG_LEVEL=info
NODE_ENV=development
```

---

## Boot Order

```
connectDB()         — Chroma must be reachable before any NATS events trigger upserts
startSubscribers()  — start consuming events only after DB confirmed reachable
app.listen()        — HTTP server starts last
```
