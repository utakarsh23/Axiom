# Workspace Service

Source of truth for all organisational data — workspaces and repositories. Every other service that processes code (Ingestion, Graph, Vector, Documentation, Search) operates within the context of a `workspaceId` and `repoId` that originate here.

**Port:** `9000`

---

## Responsibilities

- Create, read, and delete workspaces scoped to a user
- Create, read, and delete repositories within a workspace
- Provide `workspaceId` and `repoId` references used by all downstream services

---

## Architecture

```
API Gateway (8080)
      │
      │  Injects x-user-id header from verified JWT
      ▼
Workspace Service (9000)
      │
      └──► MongoDB    workspaces + repos collections
```

This service has no NATS subscriptions and makes no outbound HTTP calls. It is a pure REST CRUD service.

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (CommonJS) |
| Runtime | Node.js |
| HTTP Server | Express 5 |
| Database | MongoDB via Mongoose |
| Logging | Pino |
| Config | dotenv |

---

## Project Structure

```
workspace-service/
├── src/
│   ├── index.ts                        # Entry point — boot sequence + graceful shutdown
│   ├── config.ts                       # Centralised config from env vars
│   ├── logger.ts                       # Pino logger instance
│   ├── db/
│   │   └── client.ts                   # Mongoose connect / disconnect
│   ├── model/
│   │   ├── workspaceModel.ts           # IWorkspace interface + schema + model
│   │   └── repoModel.ts                # IRepo interface + schema + model
│   ├── services/
│   │   ├── workspaceService.ts         # Workspace business logic + DB queries
│   │   └── repoService.ts              # Repo business logic + DB queries
│   └── api/
│       └── router.ts                   # All 8 REST endpoints
├── package.json
├── tsconfig.json
├── .env
└── .env.example
```

---

## Data Models

### Workspace — collection: `workspaces`
**Unique index:** `{ userId, name }`

```typescript
interface IWorkspace {
  name:      string;   // workspace display name
  userId:    string;   // owner — injected by API Gateway from JWT
  createdAt: Date;
  updatedAt: Date;
}
```

### Repo — collection: `repos`
**Unique index:** `{ workspaceId, name }`

```typescript
interface IRepo {
  workspaceId: string;   // parent workspace
  name:        string;   // repo display name
  gitUrl:      string;   // Git clone URL — used by Ingestion Service
  branch:      string;   // branch to ingest, default 'main'
  language:    string;   // primary language e.g. 'typescript', 'python'
  createdAt:   Date;
  updatedAt:   Date;
}
```

---

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/workspaces` | List workspaces for authenticated user |
| `POST` | `/workspaces` | Create a workspace |
| `GET` | `/workspaces/:workspaceId` | Get a workspace |
| `DELETE` | `/workspaces/:workspaceId` | Delete a workspace |
| `GET` | `/workspaces/:workspaceId/repos` | List repos in a workspace |
| `POST` | `/workspaces/:workspaceId/repos` | Add a repo to a workspace |
| `GET` | `/workspaces/:workspaceId/repos/:repoId` | Get a repo |
| `DELETE` | `/workspaces/:workspaceId/repos/:repoId` | Delete a repo |

---

### GET `/workspaces`

Reads `userId` from the `x-user-id` header — set by API Gateway after JWT verification. This service never handles auth tokens directly.

**Response `200`**
```json
{
  "workspaces": [
    {
      "_id": "ws-objectid",
      "name": "my-project",
      "userId": "user-123",
      "createdAt": "2026-03-03T10:00:00.000Z"
    }
  ]
}
```

---

### POST `/workspaces`

**Request body:**
```json
{ "name": "my-project" }
```
`userId` is read from `x-user-id` header, not the body.

**Response `201`**
```json
{ "workspace": { "_id": "...", "name": "my-project", "userId": "user-123" } }
```

**Response `409`** — workspace name already exists for this user
```json
{ "error": "Workspace name already exists" }
```

---

### POST `/workspaces/:workspaceId/repos`

**Request body:**
```json
{
  "name": "backend",
  "gitUrl": "https://github.com/org/backend.git",
  "language": "typescript",
  "branch": "main"
}
```
`branch` is optional — defaults to `"main"`.

**Response `201`**
```json
{ "repo": { "_id": "...", "workspaceId": "...", "name": "backend", "gitUrl": "..." } }
```

**Response `409`** — repo name already exists in this workspace
```json
{ "error": "Repo name already exists in this workspace" }
```

---

## Auth Model

This service trusts the `x-user-id` header unconditionally. It is an **internal service** — it must never be exposed directly to the internet. API Gateway is responsible for:

1. Verifying the JWT
2. Extracting `userId` from the token payload
3. Injecting `x-user-id: <userId>` on every proxied request

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/workspace-service` | MongoDB connection string |
| `PORT` | `9000` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |

---

## Running Locally

**Prerequisites:** MongoDB must be running.

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
connectDB()       → MongoDB ready
app.listen(9000)  → HTTP server accepting requests
```

On `SIGTERM` or `SIGINT`: MongoDB disconnects gracefully before process exits.

---

## Error Handling

- Missing `x-user-id` header → `400`
- Missing required body fields → `400`
- Invalid MongoDB ObjectId format → `400` (guards prevent Mongoose `CastError`)
- Resource not found → `404`
- Duplicate name (unique index violation) → `409`
- All async DB operations wrapped in try/catch with structured pino log context
