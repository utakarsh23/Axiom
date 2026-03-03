import express from 'express';
import { config } from './config';
import logger from './logger';
import { connectNats, disconnectNats } from './nats/client';
import { registerSubscribers } from './nats/subscriber';
import { router } from './api/router';

const app = express();

app.use(express.json());
app.use(router);

const start = async (): Promise<void> => {
  try {
    // Connect to NATS before starting the HTTP server
    await connectNats();
    logger.info('Connected to NATS');

    // Register all event subscribers
    registerSubscribers();
    logger.info('NATS subscribers registered');

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'ci-vuln-service started');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start ci-vuln-service');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await disconnectNats();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  await disconnectNats();
  process.exit(0);
});

start();