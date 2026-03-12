# Frontend — Interactive Call Graph Visualization

## Overview

An interactive, lazily-expanding call graph that starts from entry files and lets users click to expand functions/files. If a file is already expanded on the canvas, new edges link to the **existing** node instead of duplicating it.

---

## Core Behavior

### 1. Entry Point Detection (Root Nodes)

Show files that are **entry points** — server starters, route files, main files:

- Detect via known patterns: `index.js`, `server.js`, `app.js`, `main.ts`, `*Router.js`, `*Application.java`
- OR query Neo4j for functions with zero incoming `CALLS` edges

### 2. Click File → Expand Functions

When a user clicks a file node, fetch all `Function`, `Endpoint`, and `Class` entities inside that file and render them as child nodes.

### 3. Click Function → Expand Calls

When a user clicks a function node, fetch:

- **Internal calls** (`CALLS` edges) — shows target function + its file
- **External calls** (`CALLS_EXTERNAL` edges) — shows external service name (e.g., `axios`, `ethers`, `jwt`)

### 4. Node Deduplication (Critical)

Maintain a `Map<filePath, DOMNode>` on the frontend.  
When expanding a function that calls into an **already-rendered file**:

- Do **NOT** create a new node
- Draw an edge to the **existing** node instead
- Optionally highlight the reused node briefly (pulse animation)

---

## Required API Endpoints (graph-service)

### `GET /graph/:repoId/entry-files`

Returns root file paths (entry points).

```cypher
MATCH (n:Function {repoId: $repoId})
WHERE NOT ()-[:CALLS]->(n)
RETURN DISTINCT n.filePath AS file, collect(n.name) AS functions
```

### `GET /graph/:repoId/file-functions?filePath=...`

Returns all entities inside a specific file.

```cypher
MATCH (n {repoId: $repoId, filePath: $filePath})
RETURN n.name AS name, n.kind AS kind, labels(n)[0] AS type
```

### `GET /graph/:repoId/function-calls?name=...&filePath=...`

Returns what a specific function calls.

```cypher
MATCH (n:Function {repoId: $repoId, name: $name, filePath: $filePath})
OPTIONAL MATCH (n)-[:CALLS]->(internal)
OPTIONAL MATCH (n)-[:CALLS_EXTERNAL]->(ext)
RETURN
  collect(DISTINCT {name: internal.name, file: internal.filePath}) AS internalCalls,
  collect(DISTINCT {name: ext.name}) AS externalCalls
```

---

## Frontend State Management

```
nodeRegistry: Map<string, NodeState>    // key = filePath or entityId
expandedNodes: Set<string>              // tracks which nodes are opened
edges: Array<{ from: string, to: string, type: 'CALLS' | 'CALLS_EXTERNAL' | 'API_CALL' }>
```

### Node Types & Visual Style

| Node Type       | Shape      | Color         | Icon           |
|-----------------|------------|---------------|----------------|
| File            | Rounded rect | Slate/dark   | 📄 file icon   |
| Function        | Pill        | Blue          | ƒ              |
| Endpoint        | Pill        | Green         | ⚡ or GET/POST |
| Class           | Rectangle   | Purple        | ◆              |
| ExternalService | Diamond     | Orange/amber  | 📦             |

### Edge Types & Visual Style

| Edge Type       | Style           | Color  |
|-----------------|-----------------|--------|
| CALLS           | Solid arrow     | White  |
| CALLS_EXTERNAL  | Dashed arrow    | Orange |
| API_CALL        | Dotted arrow    | Green  |

---

## Example User Flow

```
1. User opens repo graph page
2. Sees root files: backend/routes/PublicRouter.js, backend/routes/EventRouter.js, ...
3. Clicks "PublicRouter.js" → expands to show endpoints: POST /login, POST /signup, ...
4. Clicks "POST /signup" → shows it routes to signUp in PublicController.js
5. Clicks "PublicController.js" → expands to show: signUp, login, walletLogin, ...
6. signUp → [User] (external), login → [User, bcrypt] (external)
7. Clicks "login" → shows it calls verifyUserAuth in authService.js
8. authService.js renders as NEW node (first time)
9. Another function ALSO calls verifyUserAuth → edge links to EXISTING authService.js node ✓
```

---

## Tech Choices (TBD)

- **Graph library**: `react-flow` (preferred — built-in zoom/pan/edge routing) OR `d3-force`
- **Layout algorithm**: Dagre (hierarchical left-to-right) or ELK
- **Animation**: Framer Motion for expand/collapse transitions

---

## Completed Backend Changes

- ✅ `tsWalker.ts` — Express router handler extraction (endpoint → handler/middleware `CALLS`)
- ✅ `endpointMatcher.ts` — NEW — auto-creates `API_CALL` edges between matching endpoints in workspace
- ✅ `subscriber.ts` — wired endpoint matching into `ENTITY_CREATED` flow
- ✅ graph-service — 3 new GET endpoints for lazy graph expansion (entry-files, file-functions, function-calls)
