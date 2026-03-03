import express from 'express';
import { config } from './config';
import { connectDB, disconnectDB } from './db/client';
import { startSubscribers, stopSubscribers } from './events/subscriber';
import { graphRouter } from './api/router';
import { logger } from './logger';

async function start(): Promise<void> {
  // Boot order:
  // 1. Neo4j first — handlers need the driver before any event is processed
  // 2. Subscribers second — start consuming events only after DB is ready
  await connectDB();
  await startSubscribers();

  const app = express();

  app.use(express.json());

  // All graph query routes mounted under /graph
  app.use('/graph', graphRouter);

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'graph-service' });
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Graph Service listening');
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');
    server.close();
    await stopSubscribers();
    await disconnectDB();
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});