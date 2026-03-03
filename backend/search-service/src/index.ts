import express from 'express';
import { config } from './config';
import logger from './logger';
import { router } from './api/router';

const app = express();

app.use(express.json());

// Health check — used by orchestrators to verify the service is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'search-service' });
});

app.use(router);

// Search Service is stateless — no DB, no NATS.
// Boot is just starting the HTTP server.
const start = () => {
  try {
    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Search service listening');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start search service');
    process.exit(1);
  }
};

// Graceful shutdown — no connections to drain, just exit cleanly
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();