import { Router, Request, Response } from 'express';
import { handleSearch } from '../services/searchService';

const router = Router();

// POST /search — main RAG search endpoint
// Body: { workspaceId, query, topK? }
// Returns { answer, results } — LLM-generated answer + source entities
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { workspaceId, query, topK } = req.body;
    const response = await handleSearch({ workspaceId, query, topK });
    res.json(response);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export { router };