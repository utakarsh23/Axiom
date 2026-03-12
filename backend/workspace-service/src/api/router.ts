import { Router, Request, Response } from 'express';
import { WorkspaceModel } from '../model/workspaceModel';
import { RepoModel } from '../model/repoModel';

import {
  handleListWorkspaces,
  handleCreateWorkspace,
  handleGetWorkspace,
  handleDeleteWorkspace,
  handleGetRulebook,
  handleUpdateRulebook,
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

    // Aggregate repo counts for all workspaces in a single query
    const ids = workspaces.map((w: any) => w._id.toString());
    const counts = await RepoModel.aggregate([
      { $match: { workspaceId: { $in: ids } } },
      { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
    ]);
    const countMap: Record<string, number> = {};
    counts.forEach((c: any) => { countMap[c._id] = c.count; });

    const enriched = workspaces.map((w: any) => ({
      ...w,
      repoCount: countMap[w._id.toString()] || 0,
    }));

    res.json({ workspaces: enriched });
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

// Get the rulebook for a workspace — returns null if not set
router.get('/workspaces/:workspaceId/rulebook', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const rulebook = await handleGetRulebook(workspaceId);
    res.json({ rulebook });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Create or replace the rulebook for a workspace
// Full replacement — send the entire rulebook object
router.put('/workspaces/:workspaceId/rulebook', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const rulebook = req.body;
    const updated = await handleUpdateRulebook(workspaceId, rulebook);
    res.json({ rulebook: updated });
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
// installationId is read from the workspace document — never accepted from the client.
// owner is parsed from gitUrl automatically.
router.post('/workspaces/:workspaceId/repos', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { name, gitUrl, branch, language } = req.body;
    const repo = await handleCreateRepo(workspaceId, name, gitUrl, language, branch);
    res.status(201).json({ repo });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// Store GitHub App installationId on the workspace.
// Called server-side during the GitHub App install/redirect flow — never from the frontend directly.
// PATCH /workspaces/:workspaceId/installation
// Body: { installationId: number }
router.patch('/workspaces/:workspaceId/installation', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { installationId } = req.body;

    if (!installationId || typeof installationId !== 'number') {
      res.status(400).json({ error: 'installationId is required and must be a number' });
      return;
    }

    const workspace = await WorkspaceModel.findByIdAndUpdate(
      workspaceId,
      { installationId },
      { new: true }
    ).lean();

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json({ workspace });
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