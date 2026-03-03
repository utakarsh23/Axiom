import { connect, NatsConnection, StringCodec, Subscription } from 'nats';
import { config } from '../config';
import logger from '../logger';

// Single shared NATS connection — initialized once at startup
let nc: NatsConnection | null = null;
const sc = StringCodec();

// Tracks all active subscriptions for clean shutdown
const subscriptions: Subscription[] = [];

// Establishes the NATS connection — must be called before registerSubscribers
const connectNats = async (): Promise<void> => {
  try {
    nc = await connect({ servers: config.nats.url });
    logger.info({ url: config.nats.url }, 'NATS connection established');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to NATS');
    throw err;
  }
};

// Drains all subscriptions and closes the connection gracefully
const disconnectNats = async (): Promise<void> => {
  for (const sub of subscriptions) {
    sub.unsubscribe();
  }
  await nc?.drain();
  nc = null;
  logger.info('NATS connection drained and closed');
};

// Returns the active connection — throws if connectNats() was not called
const getNatsConnection = (): NatsConnection => {
  if (!nc) {
    throw new Error('NATS not connected — call connectNats() first');
  }
  return nc;
};

export { connectNats, disconnectNats, getNatsConnection, sc, subscriptions };