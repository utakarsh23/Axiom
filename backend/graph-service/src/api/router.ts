import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import {
  getWorkspaceGraph,
  getRepoGraph,
  getImpact,
  getTimelineGraph,
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

export { graphRouter };