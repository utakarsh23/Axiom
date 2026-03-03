# Workspace Service

Source of truth for all organisational data — workspaces and repositories. Every other service that processes code (Ingestion, Graph, Vector, Documentation, Search) operates within the context of a `workspaceId` and `repoId` that originate here.

**Port:** `9000`

---

## Responsibilities

- Create, read, and delete workspaces scoped to a user
- Create, read, and delete repositories within a workspace
- Store the GitHub App `installationId` per workspace (set during GitHub App install flow)
- Publish `REPO_ADDED` to NATS on repo creation to kick off cold start ingestion
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
      ├──► MongoDB    workspaces + repos collections
      │
      └──► NATS       publishes REPO_ADDED on repo creation
```

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (CommonJS) |
| Runtime | Node.js |
| HTTP Server | Express 5 |
| Database | MongoDB via Mongoose |
| Messaging | NATS (publisher only) |
| Logging | Pino |
| Config | dotenv |

---

## Project Structure

```
workspace-service/
├── src/
│   ├── index.ts                        # Entry point — boot: DB → NATS → HTTP
│   ├── config.ts                       # Centralised config from env vars
│   ├── logger.ts                       # Pino logger instance
│   ├── db/
│   │   └── client.ts                   # Mongoose connect / disconnect
│   ├── events/
│   │   └── index.ts                    # NATS publisher (connectNats, publishRaw)
│   ├── model/
│   │   ├── workspaceModel.ts           # IWorkspace interface + schema + model
│   │   └── repoModel.ts                # IRepo interface + schema + model
│   ├── services/
│   │   ├── workspaceService.ts         # Workspace business logic + DB queries
│   │   └── repoService.ts              # Repo business logic + REPO_ADDED publish
│   └── api/
│       └── router.ts                   # All REST endpoints
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
  name:            string;   // workspace display name
  userId:          string;   // owner — injected by API Gateway from JWT
  installationId?: number;   // GitHub App installation ID — set during GitHub App install flow
  rulebook?:       IRulebook;
  createdAt: Date;
  updatedAt: Date;
}
```

### Repo — collection: `repos`
**Unique index:** `{ workspaceId, name }`

```typescript
interface IRepo {
  workspaceId:    string;   // parent workspace
  name:           string;   // repo name (GitHub repo name)
  owner:          string;   // GitHub owner / org — parsed from gitUrl at creation
  gitUrl:         string;   // Git clone URL
  defaultBranch:  string;   // branch to ingest — defaults to 'main'
  language:       string;   // primary language e.g. 'typescript', 'python'
  createdAt:      Date;
  updatedAt:      Date;
}
```

> `installationId` lives on the Workspace (one per workspace — set during GitHub App install flow). `owner` is parsed from `gitUrl` and stored on the Repo at creation time. Neither is sent by the client — both are derived server-side.

---

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/workspaces` | List workspaces for authenticated user |
| `POST` | `/workspaces` | Create a workspace |
| `GET` | `/workspaces/:workspaceId` | Get a workspace |
| `DELETE` | `/workspaces/:workspaceId` | Delete a workspace |
| `PATCH` | `/workspaces/:workspaceId/installation` | Set GitHub App installationId on workspace |
| `GET` | `/workspaces/:workspaceId/repos` | List repos in a workspace |
| `POST` | `/workspaces/:workspaceId/repos` | Add a repo — triggers cold start ingestion |
| `GET` | `/workspaces/:workspaceId/repos/:repoId` | Get a repo |
| `DELETE` | `/workspaces/:workspaceId/repos/:repoId` | Delete a repo |

---

### PATCH `/workspaces/:workspaceId/installation`

Called **server-side** during the GitHub App install/redirect flow — never from the frontend directly.

**Request body:**
```json
{ "installationId": 12345678 }
```

**Response `200`**
```json
{ "workspace": { "_id": "...", "name": "my-project", "installationId": 12345678 } }
```

---

### POST `/workspaces/:workspaceId/repos`

`installationId` is read from the workspace document (never from the client).  
`owner` is parsed from `gitUrl` automatically (e.g. `https://github.com/owner/repo` → `owner`).

**Request body:**
```json
{
  "name": "backend",
  "gitUrl": "https://github.com/org/backend",
  "language": "typescript",
  "branch": "main"
}
```
`branch` is optional — defaults to `"main"`.

**Response `400`** — if `installationId` has not been set on the workspace yet:
```json
{ "error": "GitHub App is not installed for this workspace — complete the GitHub App installation first" }
```

**Response `201`**
```json
{ "repo": { "_id": "...", "workspaceId": "...", "name": "backend", "gitUrl": "..." } }
```

On success, publishes `REPO_ADDED` to NATS to trigger cold start ingestion.

---

## NATS Events Published

| Subject | Trigger | Payload |
|---|---|---|
| `REPO_ADDED` | Repo created | `{ workspaceId, repoId, installationId, owner, repo, defaultBranch }` |

`commitSha` is intentionally omitted — Ingestion Service calls `fetchLatestCommitSha()` via GitHub API to resolve the HEAD commit itself.

`installationId` is read from the Workspace document. `owner` is read from the stored Repo `owner` field. Neither is provided by the client.

---

## Cold Start Flow

```
User adds a repo via POST /workspaces/:id/repos
  → workspace-service reads installationId from Workspace document
  → parses owner from gitUrl, stores on Repo
  → saves Repo to MongoDB
  → publishes REPO_ADDED to NATS
      → Ingestion Service receives REPO_ADDED
      → calls fetchLatestCommitSha() → resolves HEAD commit SHA from GitHub API
      → runs Full Mode:
          → fetch entire repo file tree at HEAD commit
          → for each supported file: fetch content → parse AST → extract entities + calls
          → compute hashes, computeDiff (old state empty → everything is ENTITY_CREATED)
          → publishEvents: ENTITY_CREATED, RELATION_ADDED, EMBEDDING_REQUIRED, DOC_REQUIRED
          → upsert entity hashes + call lists to MongoDB (axiom_ingestion)
      → Graph Service creates nodes + edges in Neo4j
      → Vector Service generates and stores embeddings
```

---

## Auth Model

This service trusts the `x-user-id` header unconditionally. It is an **internal service** — never exposed directly to the internet. API Gateway is responsible for:

1. Verifying the JWT
2. Extracting `userId` from the token payload
3. Injecting `x-user-id: <userId>` on every proxied request

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/workspace-service` | MongoDB connection string |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `PORT` | `9000` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |

---

## Boot Sequence

```
connectDB()       → MongoDB ready
connectNats()     → NATS publisher ready
app.listen(9000)  → HTTP server accepting requests
```

On `SIGTERM` or `SIGINT`: NATS drains and MongoDB disconnects gracefully before process exits.

---

## Error Handling

- Missing `x-user-id` header → `400`
- Missing required body fields → `400`
- Invalid MongoDB ObjectId format → `400`
- `installationId` not set on workspace → `400`
- Resource not found → `404`
- Duplicate name (unique index violation) → `409`
