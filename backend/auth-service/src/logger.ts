import pino from 'pino';
import { config } from './config';

const logger = pino({
  level: config.logLevel,
  base: { service: 'auth-service' },
});

export default logger;