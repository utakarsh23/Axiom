# Todo

## Ingestion Service

### v2 — Cross-Service Call Detection (`src/extractor/tsWalker.ts`)

Add detection for the following patterns inside the `call_expression` case:

| Pattern | Example | Graph Edge | Target Node |
|---------|---------|------------|-------------|
| Kafka | `producer.send('topic-name', message)` | `CALLS_API` | `ExternalService: kafka:<topic>` |
| RabbitMQ | `channel.publish('exchange', ...)` | `CALLS_API` | `ExternalService: rabbitmq:<exchange>` |
| NATS | `nc.publish('subject', data)` | `CALLS_API` | `ExternalService: nats:<subject>` |
| gRPC | `client.MethodName(request)` | `CALLS_API` | `ExternalService: grpc:<service>` |
| HTTP client | `axios.get(url)` / `fetch(url)` | `CALLS_API` | `ExternalService` parsed from URL |

These produce `CALLS_API` edges in Neo4j, not `CALLS` edges.
Impact traversal must follow both edge types for full cross-service blast radius.

---

### v2 — Language Walkers (`src/extractor/`)

Walkers not yet implemented — currently return empty results:

- [ ] `pyWalker.ts` — Python
- [ ] `javaWalker.ts` — Java
- [ ] `cWalker.ts` — C / C++
- [ ] `goWalker.ts` — Go
- [ ] `rustWalker.ts` — Rust
- [ ] `solWalker.ts` — Solidity

---

## All Services — Refactor Routers to Controllers

Currently all services use a flat `src/api/router.ts` that calls service handlers directly.
Refactor to a proper controller layer across all services.

**Target structure:**
```
src/
  api/
    router.ts                    — routing only, maps path → controller method
    controllers/
      workspace.controller.ts
      repo.controller.ts
      (one file per resource)
```

**Controller responsibilities:**
- Extract and validate request params / body / headers
- Call the service handler
- Format and send the HTTP response
- Map `err.status` to correct HTTP status codes

**Services to refactor:**
- [ ] `workspace-service` — workspaceController + repoController
- [ ] `search-service` — searchController
- [ ] `documentation-service` — docController
- [ ] `vector-service` — vectorController
- [ ] `graph-service` — graphController
- [ ] `ingestion-service` — webhookController
- [ ] `auth-service` — authController (OAuth + verify endpoints)

---

## Infrastructure

- [ ] `nginx.conf` — reverse proxy routing + `auth_request` for all protected routes
- [ ] `docker-compose.yml` — internal Docker network, only NGINX exposed on :80/:443
