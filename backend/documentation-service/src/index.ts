import express from 'express';
import { config } from './config';
import {logger} from './logger';
import { connectDB, disconnectDB } from './db/client';
import { startSubscribers } from './events/subscriber';
import { router } from './api/router';

const app = express();

app.use(express.json());

// Health check — used by orchestrators to verify the service is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'documentation-service' });
});

app.use(router);

// Boot sequence — DB must be ready before accepting events or HTTP traffic
const start = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected');

    await startSubscribers();
    logger.info('NATS subscribers started');

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Documentation service listening');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start documentation service');
    process.exit(1);
  }
};

// Graceful shutdown — allow in-flight requests and NATS messages to settle
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  try {
    await disconnectDB();
    logger.info('MongoDB disconnected');
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();