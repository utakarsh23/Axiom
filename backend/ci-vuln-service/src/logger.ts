import pino from 'pino';

// Structured logger — service name attached to every log entry
const logger = pino({
  base: { service: 'ci-vuln-service' },
});

export default logger;