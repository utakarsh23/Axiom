import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import {
  getWorkspaceGraph,
  getRepoGraph,
  getImpact,
  getTimelineGraph,
  getEntryFiles,
  getFileFunctions,
  getFunctionCalls,
} from '../services/graphService';

const graphRouter = Router();

graphRouter.get('/:workspaceId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  try {
    const graph = await getWorkspaceGraph(workspaceId);
    res.json(graph);
  } catch (error: any) {
    logger.error({ workspaceId, error }, 'Failed to fetch workspace graph');
    res.status(500).json({ error: 'Failed to fetch graph' });
  }
});

graphRouter.get('/:workspaceId/repo/:repoId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const repoId = req.params.repoId as string;
  try {
    const graph = await getRepoGraph(workspaceId, repoId);
    res.json(graph);
  } catch (error: any) {
    logger.error({ workspaceId, repoId, error }, 'Failed to fetch repo graph');
    res.status(500).json({ error: 'Failed to fetch repo graph' });
  }
});

graphRouter.get('/:workspaceId/impact/:entityName', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const entityName = req.params.entityName as string;
  try {
    const impact = await getImpact(workspaceId, entityName);
    res.json(impact);
  } catch (error: any) {
    logger.error({ workspaceId, entityName, error }, 'Failed to compute impact');
    res.status(500).json({ error: 'Failed to compute impact' });
  }
});

graphRouter.get('/:workspaceId/timeline', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const { commit } = req.query as { commit?: string };

  if (!commit) {
    res.status(400).json({ error: 'commit query parameter is required' });
    return;
  }

  try {
    const graph = await getTimelineGraph(workspaceId, commit);
    res.json(graph);
  } catch (error: any) {
    logger.error({ workspaceId, commit, error }, 'Failed to fetch timeline graph');
    res.status(500).json({ error: 'Failed to fetch timeline graph' });
  }
});

// ── Lazy-expand endpoints (per frontend.md) ──────────────────────────────────

graphRouter.get('/:workspaceId/:repoId/entry-files', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const repoId = req.params.repoId as string;
  try {
    const result = await getEntryFiles(workspaceId, repoId);
    res.json(result);
  } catch (error: any) {
    logger.error({ workspaceId, repoId, error }, 'Failed to fetch entry files');
    res.status(500).json({ error: 'Failed to fetch entry files' });
  }
});

graphRouter.get('/:workspaceId/:repoId/file-functions', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const repoId = req.params.repoId as string;
  const filePath = req.query.filePath as string;
  if (!filePath) {
    res.status(400).json({ error: 'filePath query parameter is required' });
    return;
  }
  try {
    const result = await getFileFunctions(workspaceId, repoId, filePath);
    res.json(result);
  } catch (error: any) {
    logger.error({ workspaceId, repoId, filePath, error }, 'Failed to fetch file functions');
    res.status(500).json({ error: 'Failed to fetch file functions' });
  }
});

graphRouter.get('/:workspaceId/:repoId/function-calls', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const repoId = req.params.repoId as string;
  const name = req.query.name as string;
  const filePath = req.query.filePath as string;
  if (!name || !filePath) {
    res.status(400).json({ error: 'name and filePath query parameters are required' });
    return;
  }
  try {
    const result = await getFunctionCalls(workspaceId, repoId, name, filePath);
    res.json(result);
  } catch (error: any) {
    logger.error({ workspaceId, repoId, name, filePath, error }, 'Failed to fetch function calls');
    res.status(500).json({ error: 'Failed to fetch function calls' });
  }
});

export { graphRouter };