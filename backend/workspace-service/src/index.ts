import express from 'express';
import { config } from './config';
import logger from './logger';
import { connectDB, disconnectDB } from './db/client';
import { connectNats, disconnectNats } from './events/index';
import { router } from './api/router';

const app = express();

app.use(express.json());

// Health check — used by orchestrators to verify the service is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'workspace-service' });
});

app.use(router);

// Boot sequence — DB and NATS must be connected before accepting any requests
const start = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected');

    await connectNats();

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Workspace service listening');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start workspace service');
    process.exit(1);
  }
};

// Graceful shutdown — drain NATS and close Mongoose connection before exit
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  try {
    await disconnectNats();
    await disconnectDB();
    logger.info('Connections closed');
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();