# Search Service

Handles natural language code search across a workspace. Orchestrates three downstream services — Vector, Graph, and Documentation — to return semantically ranked, structurally enriched results.

**Port:** `9006`

---

## Responsibilities

- Accept a natural language query from the client
- Query Vector Service for semantically similar entities
- Enrich each result with graph neighbourhood (callers/callees) from Graph Service
- Attach LLM-generated doc blocks from Documentation Service
- Return results ranked by semantic similarity score

---

## Architecture

```
Client
  │
  │  POST /search  { workspaceId, query, topK? }
  ▼
Search Service (9006)
  │
  ├──► Vector Service (9003)        POST /vector/query
  │                                 → semantic similarity search
  │
  ├──► Graph Service (9002)         GET /graph/:workspaceId/impact/:entityName
  │                                 → 1-hop callers + callees per result (parallel)
  │
  └──► Documentation Service (9005) GET /docs/:workspaceId/entity/:entityId
                                    → doc block per result (parallel)
```

### Search Pipeline

```
1. Validate request (workspaceId + query required)
2. Vector Service → ranked candidate entities (cosine similarity)
3. For each candidate (all in parallel):
     Graph Service  → upstream[] + downstream[] (non-fatal on failure)
     Doc Service    → docBlock string | null    (non-fatal on failure)
4. Sort enriched results by descending score
5. Return to client
```

Graph and Doc fetches are **non-fatal** — if either service is unavailable, the result is still returned with empty/null values for those fields.

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (CommonJS) |
| Runtime | Node.js |
| HTTP Server | Express 5 |
| HTTP Client | Axios |
| Logging | Pino |
| Config | dotenv |

No database. No NATS. Pure HTTP orchestrator.

---

## Project Structure

```
search-service/
├── src/
│   ├── index.ts                    # Entry point — HTTP server boot + shutdown
│   ├── config.ts                   # Centralised config from env vars
│   ├── logger.ts                   # Pino logger instance
│   ├── clients/
│   │   ├── vectorClient.ts         # Typed axios wrapper for Vector Service
│   │   ├── graphClient.ts          # Typed axios wrapper for Graph Service
│   │   └── docClient.ts            # Typed axios wrapper for Documentation Service
│   ├── services/
│   │   └── searchService.ts        # Search orchestration + result enrichment
│   └── api/
│       └── router.ts               # Express router — POST /search
├── package.json
├── tsconfig.json
├── .env
└── .env.example
```

---

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/search` | Run a semantic search query |

### POST `/search`

**Request body:**
```json
{
  "workspaceId": "ws-1",
  "query": "function that parses typescript files",
  "topK": 10
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspaceId` | string | Yes | — | Workspace to search within |
| `query` | string | Yes | — | Natural language search query |
| `topK` | number | No | `10` | Max number of results to return |

**Response `200`:**
```json
{
  "results": [
    {
      "entityId": "abc123",
      "entityName": "parseFile",
      "kind": "function",
      "filePath": "src/parser.ts",
      "score": 0.94,
      "docBlock": "Parses a TypeScript source file and extracts all top-level entities...",
      "callers": ["ingestRepo", "watchFile"],
      "callees": ["readFile", "extractNodes"]
    }
  ]
}
```

| Field | Description |
|---|---|
| `score` | Cosine similarity score (0–1) — higher means more relevant |
| `docBlock` | LLM-generated documentation, `null` if not yet generated |
| `callers` | Entity names that call this entity (1-hop upstream) |
| `callees` | Entity names this entity calls (1-hop downstream) |

**Response `400`:**
```json
{ "error": "workspaceId is required" }
```

**Response `500`:**
```json
{ "error": "Vector Service query failed" }
```

---

## External Service Calls

### Vector Service — `POST /vector/query`
```json
{ "workspaceId": "ws-1", "queryText": "...", "topK": 10 }
```
Returns ranked entities by cosine similarity. This is the **only fatal dependency** — if Vector Service is down, the search fails with 500.

### Graph Service — `GET /graph/:workspaceId/impact/:entityName`
Returns `{ upstream: GraphNode[], downstream: GraphNode[] }`.
Failure returns empty arrays — result is still included in response.

### Documentation Service — `GET /docs/:workspaceId/entity/:entityId`
Returns `{ doc: DocBlock }`.
404 and failures return `null` docBlock — result is still included in response.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VECTOR_SERVICE_URL` | `http://localhost:9003` | Vector Service base URL |
| `GRAPH_SERVICE_URL` | `http://localhost:9002` | Graph Service base URL |
| `DOC_SERVICE_URL` | `http://localhost:9005` | Documentation Service base URL |
| `PORT` | `9006` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |

---

## Running Locally

**Prerequisites:** Vector Service (9003), Graph Service (9002), and Documentation Service (9005) must be running.

```bash
# Install dependencies
npm install

# Development (ts-node + nodemon)
npm run dev

# Production build
npm run build
npm start
```

---

## Error Handling

- `workspaceId` or `query` missing → `400` returned immediately, no downstream calls made
- Vector Service failure → `500` propagated to client (no results possible without it)
- Graph Service failure → empty `callers`/`callees`, result still returned
- Doc Service failure or 404 → `null` docBlock, result still returned
- All async operations wrapped in try/catch with structured pino log context
