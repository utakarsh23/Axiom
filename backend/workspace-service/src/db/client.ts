import mongoose from 'mongoose';
import { config } from '../config';
import logger from '../logger';

// Connects to MongoDB — must be called before HTTP server starts accepting requests
const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info({ uri: config.mongo.uri }, 'Connected to MongoDB');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB');
    throw err;
  }
};

// Gracefully closes the Mongoose connection on shutdown
const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (err) {
    logger.error({ err }, 'Failed to disconnect from MongoDB');
    throw err;
  }
};

export { connectDB, disconnectDB };