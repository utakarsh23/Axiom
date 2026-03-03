import dotenv from 'dotenv';
dotenv.config();

export const config = {
  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/documentation-service',
  },
  nats: {
    url: process.env.NATS_URL ?? 'nats://localhost:4222',
  },
  llmService: {
    url: process.env.LLM_SERVICE_URL ?? 'http://localhost:9004',
  },
  graphService: {
    url: process.env.GRAPH_SERVICE_URL ?? 'http://localhost:9002',
  },
  port: parseInt(process.env.PORT ?? '9005', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};