import dotenv from 'dotenv';
dotenv.config();

const config = {
  vectorService: {
    url: process.env.VECTOR_SERVICE_URL ?? 'http://localhost:9003',
  },
  graphService: {
    url: process.env.GRAPH_SERVICE_URL ?? 'http://localhost:9002',
  },
  docService: {
    url: process.env.DOC_SERVICE_URL ?? 'http://localhost:9005',
  },
  llmService: {
    url: process.env.LLM_SERVICE_URL ?? 'http://localhost:9004',
  },
  port: parseInt(process.env.PORT ?? '9006', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};

export { config };