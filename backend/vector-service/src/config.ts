import dotenv from 'dotenv';
dotenv.config();

export const config = {
  chroma: {
    url: process.env.CHROMA_URL ?? 'http://localhost:8000',
  },
  nats: {
    url: process.env.NATS_URL ?? 'nats://localhost:4222',
  },
  llmService: {
    url: process.env.LLM_SERVICE_URL ?? 'http://localhost:9004',
  },
  port: parseInt(process.env.PORT ?? '9003', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};