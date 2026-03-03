import { Router, Request, Response } from 'express';

const router = Router();

// Health check — used by Docker and load balancer
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'ci-vuln-service' });
});

export { router };