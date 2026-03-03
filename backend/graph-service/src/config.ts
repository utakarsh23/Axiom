import dotenv from 'dotenv';
dotenv.config();

export const config = {
  neo4j: {
    uri:      process.env.NEO4J_URI!,
    user:     process.env.NEO4J_USER!,
    password: process.env.NEO4J_PASSWORD!,
  },
  nats: {
    url: process.env.NATS_URL!,
  },
  port: parseInt(process.env.PORT || '9002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};