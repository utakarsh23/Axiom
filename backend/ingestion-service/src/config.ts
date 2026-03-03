import dotenv from 'dotenv';
dotenv.config();

export const config = {
  github: {
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_PRIVATE_KEY!,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  mongodb: {
    uri: process.env.MONGODB_URI!,
    dbName: process.env.MONGODB_DB_NAME!,
  },
  nats: {
    url: process.env.NATS_URL!,
  },
  port: parseInt(process.env.PORT || '9001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};