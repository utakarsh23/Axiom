import dotenv from 'dotenv';

dotenv.config();

// All configuration loaded from environment variables
const config = {
  port: parseInt(process.env.PORT ?? '9007', 10),

  nats: {
    url: process.env.NATS_URL ?? 'nats://localhost:4222',
  },

  // Internal service URLs — all on Docker internal network
  services: {
    graph:     process.env.GRAPH_SERVICE_URL     ?? 'http://localhost:9002',
    workspace: process.env.WORKSPACE_SERVICE_URL ?? 'http://localhost:9000',
    llm:       process.env.LLM_SERVICE_URL       ?? 'http://localhost:9004',
    ingestion: process.env.INGESTION_SERVICE_URL ?? 'http://localhost:9001',
  },

  github: {
    appId:          process.env.GITHUB_APP_ID          ?? '',
    privateKey:     process.env.GITHUB_PRIVATE_KEY     ?? '',
    installationId: process.env.GITHUB_INSTALLATION_ID ?? '',
  },

  // Risk level that triggers auto-merge (LOW), review (MEDIUM), block (HIGH)
  mergePolicy: {
    autoMergeBelow: process.env.AUTO_MERGE_BELOW ?? 'LOW',
  },
};

export { config };