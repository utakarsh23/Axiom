# CI / Vulnerability Service

The enforcement layer of the platform. Runs a three-tier escalating check pipeline after every commit's graph update settles. Detects structural violations, code pattern issues, and rulebook breaches — then coordinates the full autonomous patch → simulation → PR flow.

**Port:** `9007`

---

## Responsibilities

- Subscribe to `ENTITY_CREATED` and `ENTITY_UPDATED` NATS events from Ingestion Service
- Run Tier 1 structural checks via Graph Service (cycles, deprecated APIs, removed entities)
- Run Tier 2a code pattern checks via Semgrep + `npm audit`
- Run Tier 2b workspace rulebook checks (naming, JSDoc, forbidden patterns, line limits)
- Escalate to LLM Service only when findings exist — never on clean commits
- Run a simulation safety gate before raising any PR
- Create branches, commit patches, and open PRs on GitHub via Octokit
- Enforce merge policy: `LOW` = auto-merge, `MEDIUM` = require review, `HIGH` = block

---

## Architecture

```
NATS
  │  ENTITY_CREATED / ENTITY_UPDATED
  ▼
CI/Vuln Service (9007)
  │
  ├── [Tier 1] Graph Service  →  cycle check, deprecated, removed-referenced
  │
  ├── [Tier 2a] Semgrep + npm audit  →  code pattern + CVE check
  │
  ├── [Tier 2b] Workspace Service  →  fetch rulebook  →  naming / JSDoc / patterns
  │
  ├── GATE: any findings?
  │     └── NO  →  stop. Clean commit. LLM never called.
  │     └── YES
  │
  ├── [Tier 3] LLM Service  →  POST /llm/patch  →  unified diff + risk score
  │
  ├── Simulation gate
  │     └── blast radius check (Graph Service)
  │     └── destructive keyword check (patch explanation)
  │     └── HIGH risk + HIGH severity  →  discard
  │
  └── PR creation (Octokit)
        └── create branch  →  commit patch  →  open PR
        └── merge policy applied
```

After merge: GitHub fires `COMMIT_RECEIVED` → standard ingestion flow → graph + vectors update normally. Every fix is auditable.

---

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (CommonJS) |
| Runtime | Node.js |
| HTTP Server | Express 5 |
| Event Bus | NATS (`nats` client) |
| HTTP Client | Axios (Graph, Workspace, LLM) |
| GitHub API | `@octokit/rest` |
| Code Scanning | Semgrep (binary on PATH) + `npm audit` |
| Logging | Pino |
| Config | dotenv |
| Database | **None** — pure rule engine |

---

## Project Structure

```
ci-vuln-service/
├── src/
│   ├── index.ts                          # Entry point — NATS connect, subscribers, HTTP server
│   ├── config.ts                         # Centralised config from env vars
│   ├── logger.ts                         # Pino logger instance
│   ├── api/
│   │   └── router.ts                     # Health check endpoint only
│   ├── nats/
│   │   ├── client.ts                     # NATS connection + subscription tracking
│   │   └── subscriber.ts                 # ENTITY_CREATED + ENTITY_UPDATED subscribers
│   ├── clients/
│   │   ├── graphClient.ts                # Graph Service HTTP calls (cycles, impact, deprecated)
│   │   ├── workspaceClient.ts            # Workspace Service HTTP calls (rulebook fetch)
│   │   ├── llmClient.ts                  # LLM Service HTTP calls (POST /llm/patch)
│   │   └── githubClient.ts               # GitHub API via Octokit (branch, commit, PR)
│   ├── checks/
│   │   ├── tier1.ts                      # Structural checks via Graph Service
│   │   ├── tier2a.ts                     # Semgrep + dep audit
│   │   └── tier2b.ts                     # Workspace rulebook enforcement
│   ├── pipeline/
│   │   ├── runner.ts                     # Main pipeline orchestrator
│   │   ├── contextAssembler.ts           # Assembles structured context for LLM
│   │   ├── simulation.ts                 # Patch safety gate
│   │   └── prBuilder.ts                  # PR body formatter + Octokit PR creation
│   └── types/
│       ├── finding.ts                    # Finding interface — shared across all tiers
│       └── rulebook.ts                   # IRulebook mirror from Workspace Service
├── package.json
├── tsconfig.json
├── .env
└── .env.example
```

---

## Check Pipeline — Three-Tier Escalation

### Tier 1 — Structural (Graph Service Cypher queries)

| Check | How |
|---|---|
| Circular dependency | `GET /graph/:workspaceId/cycles` |
| Deprecated API still called | `GET /graph/:workspaceId/deprecated-called` |
| Removed entity still referenced | `GET /graph/:workspaceId/removed-referenced` |
| Forbidden layer access | Path-based layer inference + rulebook `architecture` rules |

All Tier 1 checks are deterministic — zero false positives.

---

### Tier 2a — Code Pattern (Semgrep + dep audit)

- Semgrep (`--config=auto`) runs on entity code string written to a temp file
- `npm audit --json` runs on the repo working directory
- Both run synchronously — results merged into findings array
- Semgrep binary must be on `PATH` in the environment

---

### Tier 2b — Rulebook (Workspace Service)

Fetched once per pipeline run via `GET /workspaces/:workspaceId/rulebook`.
Skipped entirely if rulebook is not defined for the workspace.

| Check | Rulebook Field |
|---|---|
| Naming convention | `naming.functions`, `naming.classes` |
| JSDoc presence | `comments.requireJsDoc` |
| Forbidden patterns | `structure.forbiddenPatterns` |
| Function line limit | `structure.maxFunctionLines` |

---

### Gate

```
Tier 1 + Tier 2 findings = 0  →  stop. LLM never called.
Tier 1 + Tier 2 findings > 0  →  proceed to Tier 3.
```

---

### Tier 3 — LLM Confirmation + Patch

LLM Service receives:
```json
{
  "findings": [
    { "source": "graph",   "type": "circular_dependency",  "path": ["A → B → C → A"] },
    { "source": "semgrep", "type": "javascript.sql-inject", "line": 42, "code": "..." },
    { "source": "rulebook","type": "naming_violation",      "entity": "getUserdata" }
  ],
  "entityCode": "...",
  "callers": [...],
  "callees": [...],
  "similarSafePatterns": []
}
```

Returns: confirmed violations, severity, unified diff patch, risk score (`LOW` / `MEDIUM` / `HIGH`).

---

### Simulation Gate

Before any PR is opened, the patch is validated:

1. `HIGH` risk + `HIGH` severity → discard immediately
2. Patch explanation mentions destructive keywords (`remove endpoint`, `drop api`) → discard
3. Blast radius > 20 entities → discard (too risky to auto-patch)
4. Workspace graph has existing circular deps → defer until cycles are resolved

If all checks pass → PR creation proceeds.

---

### Merge Policy

| Risk Score | Action |
|---|---|
| `LOW` | Auto-merge |
| `MEDIUM` | PR opened, requires human review |
| `HIGH` | PR blocked — manual review only |

---

## HTTP Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |

This service is primarily event-driven. The HTTP server exists for health checks and future status query endpoints.

---

## Finding Schema

```typescript
interface Finding {
  source:      'graph' | 'semgrep' | 'rulebook' | 'depaudit';
  type:        string;        // e.g. 'circular_dependency', 'sql_injection', 'naming_violation'
  description: string;
  severity?:   'LOW' | 'MEDIUM' | 'HIGH';
  line?:       number;        // line number in entity code (Semgrep)
  code?:       string;        // flagged code fragment
  path?:       string[];      // graph cycle path
  entity?:     string;        // entity name
  expected?:   string;        // expected value (naming convention)
  ruleId?:     string;        // Semgrep rule ID
}
```

---

## NATS Events Consumed

| Event | Trigger |
|---|---|
| `ENTITY_CREATED` | New entity parsed by Ingestion Service (cold start) |
| `ENTITY_UPDATED` | Changed entity after a commit diff |

**Expected payload fields:**

```typescript
{
  workspaceId: string;
  repoId:      string;
  entityId:    string;
  entityName:  string;
  entityType:  string;    // 'Function' | 'Class' | 'Endpoint'
  filePath:    string;
  code:        string;    // raw source code of the entity
  commitHash:  string;
  language:    string;
  gitUrl:      string;    // full GitHub clone URL — used for PR branch creation
  baseBranch:  string;    // default branch — PR targets this
}
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `9007` | HTTP server port |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `GRAPH_SERVICE_URL` | `http://localhost:9002` | Graph Service base URL |
| `WORKSPACE_SERVICE_URL` | `http://localhost:9000` | Workspace Service base URL |
| `LLM_SERVICE_URL` | `http://localhost:9004` | LLM Service base URL |
| `INGESTION_SERVICE_URL` | `http://localhost:9001` | Ingestion Service base URL |
| `GITHUB_APP_ID` | — | GitHub App ID for authentication |
| `GITHUB_PRIVATE_KEY` | — | GitHub App private key (PEM string) |
| `GITHUB_INSTALLATION_ID` | — | GitHub App installation ID for the target org/user |
| `AUTO_MERGE_BELOW` | `LOW` | Risk level below which PRs are auto-merged |

---

## Running Locally

**Prerequisites:** NATS server must be running. Semgrep must be installed (`pip install semgrep`). Graph Service and Workspace Service must be reachable.

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
connectNats()          →  NATS connection established
registerSubscribers()  →  ENTITY_CREATED + ENTITY_UPDATED subscriptions active
app.listen(9007)       →  HTTP health check endpoint ready
```

On `SIGTERM` or `SIGINT`: all NATS subscriptions are unsubscribed, connection is drained, then process exits.

---

## What This Service Does NOT Do

- Parse AST or fetch files from GitHub (Ingestion Service owns that)
- Write to Neo4j or ChromaDB (Graph and Vector Services own those)
- Generate embeddings
- Call LLM on every commit — only when findings exist
- Mutate the graph directly — every fix flows through the standard commit path via PR merge
