import pino from 'pino';

// Single shared logger instance for the entire ingestion service.
// All logs are structured JSON — parseable by ELK, Grafana Loki, Datadog, etc.
// Set LOG_LEVEL env var to control verbosity (default: 'info').
// In development, pipe output through `pino-pretty` for human-readable logs:
//   npm run dev | npx pino-pretty
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'ingestion-service' },
});

export { logger };
