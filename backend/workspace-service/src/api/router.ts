import { Router, Request, Response } from 'express';
import {
  handleListWorkspaces,
  handleCreateWorkspace,
  handleGetWorkspace,
  handleDeleteWorkspace,
} from '../services/workspaceService';
import {
  handleListRepos,
  handleCreateRepo,
  handleGetRepo,
  handleDeleteRepo,
} from '../services/repoService';

const router = Router();

// ─── Workspace routes ────────────────────────────────────────────────────────

// List all workspaces for the authenticated user
// userId is injected by API Gateway via x-user-id header after JWT verification
router.get('/workspaces', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const workspaces = await handleListWorkspaces(userId);
    res.json({ workspaces });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Create a new workspace
router.post('/workspaces', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { name } = req.body;
    const workspace = await handleCreateWorkspace(userId, name);
    res.status(201).json({ workspace });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Get a single workspace by id
router.get('/workspaces/:workspaceId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const workspace = await handleGetWorkspace(workspaceId);
    res.json({ workspace });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Delete a workspace by id
router.delete('/workspaces/:workspaceId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    await handleDeleteWorkspace(workspaceId);
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ─── Repo routes ─────────────────────────────────────────────────────────────

// List all repos in a workspace
router.get('/workspaces/:workspaceId/repos', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const repos = await handleListRepos(workspaceId);
    res.json({ repos });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Add a new repo to a workspace
router.post('/workspaces/:workspaceId/repos', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { name, gitUrl, branch, language } = req.body;
    // language before branch — matches updated handleCreateRepo signature (branch has default)
    const repo = await handleCreateRepo(workspaceId, name, gitUrl, language, branch);
    res.status(201).json({ repo });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Get a single repo by id within a workspace
router.get('/workspaces/:workspaceId/repos/:repoId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const repoId = req.params.repoId as string; 
    const repo = await handleGetRepo(workspaceId, repoId);
    res.json({ repo });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Delete a repo from a workspace
router.delete('/workspaces/:workspaceId/repos/:repoId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const repoId = req.params.repoId as string;
    await handleDeleteRepo(workspaceId, repoId);
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export { router };