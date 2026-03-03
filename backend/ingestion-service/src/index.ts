import express from 'express';
import { config } from './config';
import { connectDB, disconnectDB } from './db/client';
import { connectNats, disconnectNats } from './events/index';
import { startSubscribers, stopSubscribers } from './events/subscriber';
import { initParser } from './parser/index';
import { webhookRouter } from './webhook/index';
import { logger } from './logger';

async function start(): Promise<void> {
  // Boot order matters:
  // 1. DB first — mode handlers need MongoDB before any event is processed
  // 2. NATS second — publisher must be ready before subscribers start
  // 3. Parser third — WASM runtime must be initialized before any file is parsed
  // 4. Subscribers last — don't start consuming events until everything above is ready
  await connectDB();
  await connectNats();
  await initParser();
  await startSubscribers();

  const app = express();

  // Webhook route uses express.raw() — NOT express.json().
  // Signature verification requires the raw body bytes exactly as GitHub sent them.
  // express.json() would destroy the raw buffer before we can verify.
  app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRouter);

  // Health check — used by load balancers and container orchestrators
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'ingestion-service' });
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Ingestion service listening');
  });

  // Graceful shutdown — finish in-flight work before exiting.
  // SIGTERM is sent by Docker/Kubernetes when stopping a container.
  // SIGINT is sent by Ctrl+C in local dev.
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');

    // Stop accepting new HTTP connections
    server.close();

    // Drain NATS subscriptions — waits for in-flight messages to finish
    await stopSubscribers();

    // Disconnect NATS and MongoDB cleanly
    await disconnectNats();
    await disconnectDB();

    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});