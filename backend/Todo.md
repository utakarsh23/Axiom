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
