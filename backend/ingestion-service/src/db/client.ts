import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../logger';

// Mongoose connection — called once at service startup
// All models use this connection automatically via Mongoose's default connection

async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(config.mongodb.uri, {
      dbName: config.mongodb.dbName,
    });
    logger.info({ db: config.mongodb.dbName }, 'MongoDB connected');
  } catch (error: any) {
    logger.error({ error }, 'MongoDB connection failed');
    throw error;
  }
}

async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export { connectDB, disconnectDB };