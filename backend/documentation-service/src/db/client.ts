import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../logger';

// Connects to MongoDB and verifies the connection is live.
// Must be called before any NATS events arrive and trigger doc block writes.
async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info({ uri: config.mongo.uri }, 'Connected to MongoDB');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB');
    throw err;
  }
}

// Gracefully closes the Mongoose connection on shutdown.
async function disconnectDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (err) {
    logger.error({ err }, 'Failed to disconnect from MongoDB');
    throw err;
  }
}

export { connectDB, disconnectDB };