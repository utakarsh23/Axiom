import dotenv from 'dotenv';
dotenv.config();

const config = {
  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/workspace-service',
  },
  port: parseInt(process.env.PORT ?? '9000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export { config };