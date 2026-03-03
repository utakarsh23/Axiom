import { Router, Request, Response } from 'express';
import { handleGetWorkspaceDocs, handleGetEntityDoc } from '../services/docService';

const router = Router();

// Get all doc blocks for a workspace
router.get('/docs/:workspaceId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const docs = await handleGetWorkspaceDocs(workspaceId);
    res.json({ docs });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Get a single entity's doc block within a workspace
router.get('/docs/:workspaceId/entity/:entityId', async (req: Request, res: Response) => {
  try {
    
    const workspaceId = req.params.workspaceId as string;
    const entityId = req.params.entityId as string;

    const doc = await handleGetEntityDoc(workspaceId, entityId);
    res.json({ doc });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export { router };