import { Router, Request, Response } from 'express';
import { handleVectorQuery, VectorQueryRequest, handleEntityFetch, EntityFetchRequest } from '../services/vectorService';
import { logger } from '../logger';

const router = Router();

// POST /vector/query — delegates entirely to vectorService, no logic here
router.post('/query', async (req: Request, res: Response) => {
  try {
    const results = await handleVectorQuery(req.body as VectorQueryRequest);
    res.json({ results });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message ?? 'Vector query failed';
    logger.error({ err, body: req.body }, 'POST /vector/query failed');
    res.status(status).json({ error: message });
  }
});

// POST /vector/entities — fetch raw code by entity IDs, no similarity search
router.post('/entities', async (req: Request, res: Response) => {
  try {
    const results = await handleEntityFetch(req.body as EntityFetchRequest);
    res.json({ results });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message ?? 'Entity fetch failed';
    logger.error({ err, body: req.body }, 'POST /vector/entities failed');
    res.status(status).json({ error: message });
  }
});


export { router as vectorRouter };