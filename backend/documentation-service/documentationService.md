# Documentation Service

Generates and maintains LLM-powered documentation blocks for every code entity in a workspace. Runs entirely in the background — no user-facing latency. Listens for NATS events from Ingestion, calls Graph Service for caller context, and calls LLM Service to produce documentation.

**Port:** `9005`

---

## Responsibilities

- Generate a doc block for every new entity (`DOC_REQUIRED`)
- Regenerate an entity's doc block when its code changes (`ENTITY_UPDATED`)
- Regenerate 1-hop caller doc blocks on entity update (callers' docs may reference stale behaviour)
- Delete a doc block when the entity is removed (`ENTITY_DELETED`)
- Serve stored doc blocks over HTTP for consumption by API Gateway / frontend

---

## Architecture

```
Ingestion Service
      │
      │  NATS: DOC_REQUIRED / ENTITY_UPDATED / ENTITY_DELETED
      ▼
Documentation Service (9005)
      │
      ├──► Graph Service (9002)    GET /graph/:workspaceId/impact/:entityName
      │                            → fetch 1-hop callers for context
      │
      ├──► LLM Service (9004)      POST /llm/explain
      │                            → generate documentation text
      │
      └──► MongoDB                 upsert / delete docBlocks collection
```

### Doc Block Lifecycle

| Event | Action |
|---|---|
| `DOC_REQUIRED` | Fetch callers → call LLM → upsert doc block |
| `ENTITY_UPDATED` | Regenerate entity doc block + regenerate each 1-hop caller's doc block |
| `ENTITY_DELETED` | Delete doc block for the entity |

Caller regeneration on `ENTITY_UPDATED` is **best-effort** — a failure for any single caller is logged as a warning and the loop continues. It does not fail the primary entity update.

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (CommonJS) |
| Runtime | Node.js |
| HTTP Server | Express 5 |
| Database | MongoDB via Mongoose |
| Messaging | NATS (JetStream-compatible string codec) |
| HTTP Client | Axios |
| Logging | Pino |
| Config | dotenv |

---

## Project Structure

```
documentation-service/
├── src/
│   ├── index.ts                  # Entry point — boot sequence + graceful shutdown
│   ├── config.ts                 # Centralised config from env vars
│   ├── logger.ts                 # Pino logger instance
│   ├── db/
│   │   └── client.ts             # Mongoose connect / disconnect
│   ├── model/
│   │   └── docBlockModel.ts      # IDocBlock interface + Mongoose schema + model
│   ├── events/
│   │   └── subscriber.ts         # NATS connection + subject subscriptions
│   ├── handlers/
│   │   └── doc.ts                # NATS event handlers + LLM/Graph call logic
│   ├── services/
│   │   └── docService.ts         # Read query handlers for HTTP routes
│   └── api/
│       └── router.ts             # Express router — HTTP read endpoints
├── package.json
├── tsconfig.json
├── .env
└── .env.example
```

---

## Data Model

**Collection:** `docBlocks`
**Unique index:** `{ entityId, workspaceId }`

```typescript
interface IDocBlock {
  entityId:    string;   // unique identifier from Ingestion
  workspaceId: string;   // workspace scoping
  repoId:      string;
  filePath:    string;
  entityName:  string;
  kind:        string;   // function | class | endpoint
  docBlock:    string;   // LLM-generated documentation text
  commitHash:  string;   // commit at time of generation
  generatedAt: Date;
}
```

One doc block per entity per workspace. Upserted on every generate — no duplicates.

---

## NATS Events

### Consumed

| Subject | Payload fields | Action |
|---|---|---|
| `DOC_REQUIRED` | `entityId, workspaceId, repoId, filePath, entityName, kind, language, code, callList, commitHash` | Generate + store doc block |
| `ENTITY_UPDATED` | Same as above | Regenerate entity doc + 1-hop caller docs |
| `ENTITY_DELETED` | `entityId, workspaceId, entityName` | Delete doc block |

This service does **not** publish any NATS events.

---

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/docs/:workspaceId` | Get all doc blocks for a workspace |
| `GET` | `/docs/:workspaceId/entity/:entityId` | Get a single entity's doc block |

### GET `/docs/:workspaceId`

**Response `200`**
```json
{
  "docs": [
    {
      "entityId": "abc123",
      "workspaceId": "ws-1",
      "entityName": "parseFile",
      "kind": "function",
      "docBlock": "Parses a source file and extracts...",
      "generatedAt": "2026-03-03T10:00:00.000Z"
    }
  ]
}
```

### GET `/docs/:workspaceId/entity/:entityId`

**Response `200`**
```json
{
  "doc": {
    "entityId": "abc123",
    "entityName": "parseFile",
    "docBlock": "Parses a source file and extracts..."
  }
}
```

**Response `404`**
```json
{ "error": "Doc block not found" }
```

---

## External Service Calls

### Graph Service — `GET /graph/:workspaceId/impact/:entityName`

Fetches 1-hop upstream callers (entities that call the given entity). Used to provide inbound usage context to the LLM and to identify which caller doc blocks need regeneration.

Failure is non-fatal — if Graph Service is unreachable, doc generation continues with an empty `calledBy` list.

### LLM Service — `POST /llm/explain`

```json
{
  "context": {
    "entityName": "parseFile",
    "kind": "function",
    "language": "typescript",
    "filePath": "src/parser.ts",
    "code": "function parseFile(...) { ... }",
    "callList": ["readFile", "extractNodes"],
    "calledBy": ["ingestRepo", "watchFile"]
  }
}
```

**Expected response:**
```json
{ "explanation": "Parses a source file by..." }
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/documentation-service` | MongoDB connection string |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `LLM_SERVICE_URL` | `http://localhost:9004` | LLM Service base URL |
| `GRAPH_SERVICE_URL` | `http://localhost:9002` | Graph Service base URL |
| `PORT` | `9005` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |

---

## Running Locally

**Prerequisites:** MongoDB, NATS, Graph Service (9002), LLM Service (9004) must be running.

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

## Boot Sequence

```
connectDB()         → MongoDB ready
startSubscribers()  → NATS connected, DOC_REQUIRED / ENTITY_UPDATED / ENTITY_DELETED subscribed
app.listen(9005)    → HTTP server accepting requests
```

On `SIGTERM` or `SIGINT`: MongoDB disconnects gracefully before process exits.

---

## Error Handling

- All async operations are wrapped in try/catch
- NATS message parse failures are logged and discarded — subscriber stays alive
- Graph Service failures are non-fatal — doc generation continues with empty caller context
- Individual caller regeneration failures are non-fatal — loop continues to next caller
- LLM Service and MongoDB failures propagate and are logged with full context
