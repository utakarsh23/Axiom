import { Router, Request, Response } from 'express';
import { handleSearch } from '../services/searchService';

const router = Router();

// POST /search — main search endpoint
// Body: { workspaceId, query, topK? }
// Returns enriched results ranked by semantic similarity
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { workspaceId, query, topK } = req.body;
    const results = await handleSearch({ workspaceId, query, topK });
    res.json({ results });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export { router };