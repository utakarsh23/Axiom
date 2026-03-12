# Axiom — Initialization Guide

Everything you need to get Axiom running locally from scratch.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Docker | 24+ | Container runtime |
| Docker Compose | v2+ | Service orchestration |
| Node.js | v18+ | Local dev (if running services outside Docker) |
| npm | v9+ | Package management |
| Git | Any | Cloning the repo |
| Semgrep | Latest | CI/Vuln Service code scanning |
| Python | 3.8+ | Required by Semgrep |
| `openssl` | Any | Generating secrets |

Install Semgrep:
```bash
pip install semgrep
```

Verify it's on PATH:
```bash
semgrep --version
```

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/utakarsh23/Axiom.git
cd Axiom
```

---

## Step 2 — Create a GitHub OAuth App

This is used by the Auth Service for login.

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Application name**: Axiom (local)
   - **Homepage URL**: `http://localhost`
   - **Authorization callback URL**: `http://localhost/auth/github/callback`
3. Click **Register application**
4. Copy the **Client ID**
5. Click **Generate a new client secret** and copy it

---

## Step 3 — Create a GitHub App

This is used by the Ingestion Service to fetch repo contents and by CI/Vuln Service to create PRs.

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **GitHub App name**: Axiom (local)
   - **Homepage URL**: `http://localhost`
   - **Webhook URL**: `http://<your-public-url>/ingest/webhook/github`
     > For local dev, use [ngrok](https://ngrok.com): `ngrok http 80` and paste the https URL
   - **Webhook secret**: generate one — `openssl rand -hex 32`
3. Set **Repository permissions**:
   - Contents: **Read**
   - Pull requests: **Write**
   - Metadata: **Read**
4. Set **Subscribe to events**: check **Push**
5. Click **Create GitHub App**
6. On the app page, note the **App ID**
7. Scroll to **Private keys** → **Generate a private key** → a `.pem` file downloads
8. Go to **Install App** → install on your personal account or org
9. After install, the URL will contain the **Installation ID** (e.g. `https://github.com/settings/installations/12345678`)

---

## Step 4 — Configure Environment Variables

Copy the example env file:
```bash
cp .env.example .env
```

Open `.env` and fill in every variable:

```env
# ── Auth Service ────────────────────────────────────────────────
GITHUB_CLIENT_ID=           # from Step 2
GITHUB_CLIENT_SECRET=       # from Step 2
GITHUB_CALLBACK_URL=http://localhost/auth/github/callback
JWT_SECRET=                 # generate: openssl rand -base64 64
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost

# ── GitHub App (Ingestion + CI/Vuln) ────────────────────────────
GITHUB_APP_ID=              # from Step 3
GITHUB_PRIVATE_KEY=         # contents of the .pem file (keep newlines: use quotes in shell)
GITHUB_WEBHOOK_SECRET=      # the secret you set in Step 3
GITHUB_INSTALLATION_ID=     # from Step 3 install URL

# ── Neo4j ────────────────────────────────────────────────────────
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=             # choose any password, must match docker-compose.yml

# ── MongoDB ──────────────────────────────────────────────────────
MONGO_URI=mongodb://mongo:27017

# ── NATS ─────────────────────────────────────────────────────────
NATS_URL=nats://nats:4222

# ── ChromaDB ─────────────────────────────────────────────────────
CHROMA_URL=http://chroma:8000

# ── LLM Service ──────────────────────────────────────────────────
LLM_SERVICE_URL=http://llm-service:9004

# ── Service ports (internal) ─────────────────────────────────────
AUTH_PORT=8080
WORKSPACE_PORT=9000
INGESTION_PORT=9001
GRAPH_PORT=9002
VECTOR_PORT=9003
LLM_PORT=9004
DOC_PORT=9005
SEARCH_PORT=9006
CI_PORT=9007

# ── General ──────────────────────────────────────────────────────
NODE_ENV=development
LOG_LEVEL=info
AUTO_MERGE_BELOW=LOW
```

### Setting the GitHub Private Key

The private key is a multi-line PEM string. In `.env`, it must be on one line with `\n` replacing actual newlines:

```bash
# Convert the .pem file to a single-line env var value
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.pem
```

Paste the output as the value of `GITHUB_PRIVATE_KEY` in `.env`.

---

## Step 5 — Start All Services

```bash
docker compose up --build
```

This starts:
- All 9 backend services
- Neo4j, MongoDB, ChromaDB, NATS
- Nginx reverse proxy
- Frontend

First build takes a few minutes. Subsequent starts are fast.

To run in the background:
```bash
docker compose up --build -d
```

To view logs for a specific service:
```bash
docker compose logs -f graph-service
docker compose logs -f ingestion-service
```

---

## Step 6 — Verify Everything is Running

```bash
docker compose ps
```

All services should show `Up`. Then check health endpoints:

```bash
curl http://localhost/auth/health           # Auth Service
curl http://localhost/workspaces/health     # Workspace Service
curl http://localhost/ingest/health         # Ingestion Service
curl http://localhost/graph/health          # Graph Service
curl http://localhost/search/health         # Search Service
curl http://localhost/docs/health           # Doc Service
curl http://localhost/ci/health             # CI/Vuln Service
```

Each should return `200 OK`.

---

## Step 7 — Log In

Open `http://localhost` in your browser. Click **Login with GitHub**. You'll be redirected through GitHub OAuth and land back on the dashboard with a JWT.

---

## Step 8 — Create a Workspace

Via the UI or directly:

```bash
curl -X POST http://localhost/workspaces \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-workspace"}'
```

Note the returned `_id` — this is your `workspaceId`.

---

## Step 9 — Connect the GitHub App to Your Workspace

After installing the GitHub App in Step 3, link it to the workspace:

```bash
curl -X PATCH http://localhost/workspaces/<workspaceId>/installation \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"installationId": <your-installation-id>}'
```

This must be done before adding any repos.

---

## Step 10 — Add a Repository

```bash
curl -X POST http://localhost/workspaces/<workspaceId>/repos \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-repo",
    "gitUrl": "https://github.com/<owner>/<repo>",
    "language": "typescript",
    "branch": "main"
  }'
```

This triggers cold start ingestion immediately:
- Axiom fetches the full repo from GitHub
- Parses all supported files via AST
- Populates the knowledge graph in Neo4j
- Generates embeddings in ChromaDB
- Generates doc blocks in MongoDB

Cold start time depends on repo size. Watch progress:
```bash
docker compose logs -f ingestion-service
docker compose logs -f graph-service
```

---

## Step 11 — Set Up Webhooks (for commit-based updates)

Axiom needs to receive GitHub push events to update the graph on every commit.

For **local development**, expose your local port 80 with ngrok:
```bash
ngrok http 80
```

Copy the `https://....ngrok.io` URL. In your GitHub App settings (Step 3), update the **Webhook URL** to:
```
https://<ngrok-url>/ingest/webhook/github
```

For **production**, point the webhook URL to your public domain.

From this point, every push to the default branch of a registered repo will:
1. Update the knowledge graph
2. Re-embed changed entities
3. Regenerate documentation for changed entities
4. Run the CI/Vuln pipeline automatically

---

## Step 12 — (Optional) Set a Workspace Rulebook

Define coding standards that will be enforced on every commit:

```bash
curl -X PUT http://localhost/workspaces/<workspaceId>/rulebook \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "naming": {
      "functions": "camelCase",
      "classes": "PascalCase"
    },
    "structure": {
      "maxFunctionLines": 50,
      "forbiddenPatterns": ["console.log", "debugger"]
    },
    "comments": {
      "requireJsDoc": true
    }
  }'
```

If no rulebook is set, only default policy rules and Semgrep checks apply.

---

## Using the Graph

### View the full workspace graph
```
http://localhost  →  open the workspace  →  Graph tab
```

### Query via API

```bash
# Full workspace graph
curl http://localhost/graph/<workspaceId> \
  -H "Authorization: Bearer <jwt>"

# Blast radius for a function
curl http://localhost/graph/<workspaceId>/impact/getUserById \
  -H "Authorization: Bearer <jwt>"

# Graph state at a historical commit
curl "http://localhost/graph/<workspaceId>/timeline?commit=abc123" \
  -H "Authorization: Bearer <jwt>"
```

### Search queries

```bash
# RAG — "what does this code do?"
curl -X POST http://localhost/search/rag \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "<id>", "query": "function that validates JWT tokens"}'

# What-if — "what breaks if I change X?"
curl -X POST http://localhost/search/whatif \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "<id>", "entityName": "getUserById", "change": "remove the caching layer"}'

# Similarity — no LLM
curl "http://localhost/search/similar?workspaceId=<id>&query=token+validation" \
  -H "Authorization: Bearer <jwt>"
```

---

## Running Services Individually (without Docker)

If you want to run a single service locally for faster iteration:

```bash
cd backend/<service-name>
npm install
npm run dev
```

Make sure the dependencies it talks to (NATS, MongoDB, Neo4j) are still running via Docker:
```bash
docker compose up nats mongo neo4j chroma -d
```

Each service reads config from its own `.env` file. Copy the example:
```bash
cp backend/<service-name>/.env.example backend/<service-name>/.env
```

---

## Stopping and Resetting

Stop all services:
```bash
docker compose down
```

Stop and wipe all data (Neo4j, MongoDB, ChromaDB):
```bash
docker compose down -v
```

Rebuild a single service after code changes:
```bash
docker compose up --build <service-name>
```

---

## Common Issues

### Webhook events not arriving
- Make sure ngrok is running and the webhook URL in GitHub App settings matches the current ngrok URL (ngrok URLs change on restart unless you have a paid plan)
- Check `docker compose logs ingestion-service` for HMAC verification errors

### Cold start not completing
- Check that `installationId` is set on the workspace (Step 9) before adding repos
- Verify the GitHub App has `Contents: Read` permission and is installed on the correct account/org
- Watch `docker compose logs ingestion-service` for GitHub API errors

### Graph queries returning empty
- Cold start may still be running — check ingestion logs
- Confirm Neo4j is healthy: `docker compose logs neo4j`

### WASM parser ABI mismatch
- Do not upgrade `web-tree-sitter` and `tree-sitter-wasms` independently — they must be kept in sync
- If you see silent parser failures, check that both packages are at their pinned versions

### `ERR_PACKAGE_PATH_NOT_EXPORTED` in Ingestion Service
- This means `@octokit/app` was accidentally used instead of `@octokit/auth-app`
- Check `backend/ingestion-service/package.json` — it must use `@octokit/auth-app` (CJS-compatible)

### JWT errors on protected routes
- Auth Service must be reachable by Nginx on port 8080 (internal Docker network)
- Check `docker compose logs auth-service` and `docker compose logs nginx`

---

## Environment Variable Reference (All Services)

| Variable | Used By | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | Auth | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Auth | GitHub OAuth App client secret |
| `GITHUB_CALLBACK_URL` | Auth | Must match GitHub App settings |
| `JWT_SECRET` | Auth | Signing secret — use `openssl rand -base64 64` |
| `JWT_EXPIRES_IN` | Auth | Token expiry, e.g. `7d` |
| `CLIENT_URL` | Auth | Frontend URL for post-login redirect |
| `GITHUB_APP_ID` | Ingestion, CI/Vuln | GitHub App numeric ID |
| `GITHUB_PRIVATE_KEY` | Ingestion, CI/Vuln | PEM key (newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | Ingestion | HMAC secret for webhook verification |
| `GITHUB_INSTALLATION_ID` | CI/Vuln | Installation ID for PR creation |
| `NEO4J_URI` | Graph | e.g. `bolt://neo4j:7687` |
| `NEO4J_USER` | Graph | Default: `neo4j` |
| `NEO4J_PASSWORD` | Graph | Must match `docker-compose.yml` |
| `MONGO_URI` | Auth, Workspace, Ingestion, Doc | MongoDB connection string |
| `NATS_URL` | All event-driven services | e.g. `nats://nats:4222` |
| `CHROMA_URL` | Vector | e.g. `http://chroma:8000` |
| `LLM_SERVICE_URL` | Vector, Doc, Search, CI/Vuln | e.g. `http://llm-service:9004` |
| `GRAPH_SERVICE_URL` | Doc, Search, CI/Vuln | e.g. `http://graph-service:9002` |
| `VECTOR_SERVICE_URL` | Search | e.g. `http://vector-service:9003` |
| `DOC_SERVICE_URL` | Search | e.g. `http://doc-service:9005` |
| `WORKSPACE_SERVICE_URL` | CI/Vuln | e.g. `http://workspace-service:9000` |
| `AUTO_MERGE_BELOW` | CI/Vuln | Risk threshold for auto-merge: `LOW`, `MEDIUM`, `HIGH` |
| `NODE_ENV` | All | `development` or `production` |
| `LOG_LEVEL` | All | `info`, `debug`, `warn`, `error` |
