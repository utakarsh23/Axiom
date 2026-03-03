import express from 'express';
import { config } from './config';
import { logger } from './logger';
import { connectDB, disconnectDB } from './db/client';
import { startSubscribers } from './events/subscriber';
import { vectorRouter } from './api/router';

const app = express();

app.use(express.json());

// Health check — used by load balancers and orchestrators to verify the service is up
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vector-service' });
});

app.use('/vector', vectorRouter);

async function start(): Promise<void> {
  try {
    // ChromaDB must be ready before any NATS events arrive and trigger upserts
    await connectDB();

    // Start consuming EMBEDDING_REQUIRED, ENTITY_UPDATED, ENTITY_DELETED
    // Only after DB is confirmed reachable
    await startSubscribers();

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Vector Service listening');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start Vector Service');
    process.exit(1);
  }
}

// Graceful shutdown — let in-flight NATS messages finish before closing
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  await disconnectDB();
  process.exit(0);
});

start();