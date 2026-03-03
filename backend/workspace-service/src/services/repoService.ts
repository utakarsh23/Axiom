import mongoose from 'mongoose';
import { RepoModel } from '../model/repoModel';
import { WorkspaceModel } from '../model/workspaceModel';
import { publishRaw } from '../events/index';
import logger from '../logger';

// Helper — returns 400 error for invalid MongoDB ObjectId format
const assertValidObjectId = (id: string, label: string): void => {
  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error(`Invalid ${label} format`), { status: 400 });
  }
};

// Parses the GitHub owner (org or user login) from a GitHub git URL.
// Supports both HTTPS and SSH forms:
//   https://github.com/owner/repo.git  →  owner
//   git@github.com:owner/repo.git      →  owner
const parseOwnerFromGitUrl = (gitUrl: string): string => {
  const match = gitUrl.match(/github\.com[/:]([^/]+)\//);
  if (!match) {
    throw Object.assign(
      new Error('Cannot parse GitHub owner from gitUrl — expected https://github.com/owner/repo or git@github.com:owner/repo'),
      { status: 400 }
    );
  }
  return match[1];
};

// List all repos in a workspace
const listRepos = async (workspaceId: string) => {
  return RepoModel.find({ workspaceId }).lean();
};

// Fetch a single repo by id within a workspace
const getRepo = async (workspaceId: string, repoId: string) => {
  return RepoModel.findOne({ _id: repoId, workspaceId }).lean();
};

// Add a new repo to a workspace
const createRepo = async (
  workspaceId: string,
  name: string,
  gitUrl: string,
  branch: string,
  language: string,
) => {
  const repo = new RepoModel({ workspaceId, name, gitUrl, branch, language });
  return repo.save();
};

// Delete a repo from a workspace
const deleteRepo = async (workspaceId: string, repoId: string) => {
  return RepoModel.findOneAndDelete({ _id: repoId, workspaceId });
};

// Validates input and lists all repos in a workspace
const handleListRepos = async (workspaceId: string) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }

  try {
    return await listRepos(workspaceId);
  } catch (err) {
    logger.error({ err, workspaceId }, 'Failed to list repos');
    throw err;
  }
};

// Validates input and creates a repo in a workspace.
// installationId is read from the workspace document — never accepted from the client.
// owner is parsed from the gitUrl — no need for the client to send it separately.
const handleCreateRepo = async (
  workspaceId: string,
  name: string,
  gitUrl: string,
  language: string,
  branch: string = 'main'
) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }
  if (!name || name.trim().length === 0) {
    throw Object.assign(new Error('name is required'), { status: 400 });
  }
  if (!gitUrl || gitUrl.trim().length === 0) {
    throw Object.assign(new Error('gitUrl is required'), { status: 400 });
  }
  if (!language || language.trim().length === 0) {
    throw Object.assign(new Error('language is required'), { status: 400 });
  }

  // Parse owner from gitUrl — fails fast with a clear error if the URL is malformed
  const owner = parseOwnerFromGitUrl(gitUrl.trim());

  // Fetch installationId from the workspace — set during the GitHub App install flow
  const workspace = await WorkspaceModel.findById(workspaceId).lean();
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found'), { status: 404 });
  }
  if (!workspace.installationId) {
    throw Object.assign(
      new Error('GitHub App is not installed for this workspace — complete the GitHub App installation first'),
      { status: 400 }
    );
  }

  const installationId = workspace.installationId;

  try {
    const repo = await createRepo(workspaceId, name.trim(), gitUrl.trim(), branch, language.trim());

    // Kick off cold start ingestion — Ingestion Service listens for REPO_ADDED and runs Full Mode.
    // commitSha is omitted intentionally — Ingestion resolves the latest HEAD commit from GitHub.
    publishRaw('REPO_ADDED', {
      workspaceId,
      repoId: repo._id.toString(),
      installationId,
      owner,
      repo: name.trim(),
      branch,
    });

    logger.info({ workspaceId, repoId: repo._id }, 'REPO_ADDED published to NATS');
    return repo;
  } catch (err: any) {
    // Duplicate key — repo name already exists in this workspace
    if (err.code === 11000) {
      throw Object.assign(new Error('Repo name already exists in this workspace'), { status: 409 });
    }
    logger.error({ err, workspaceId }, 'Failed to create repo');
    throw err;
  }
};

// Validates input and returns a single repo
const handleGetRepo = async (workspaceId: string, repoId: string) => {
  if (!workspaceId || !repoId) {
    throw Object.assign(new Error('workspaceId and repoId are required'), { status: 400 });
  }

  // Validate ObjectId format before querying — Mongoose throws CastError otherwise
  assertValidObjectId(repoId, 'repoId');

  let repo;

  try {
    repo = await getRepo(workspaceId, repoId);
  } catch (err) {
    logger.error({ err, workspaceId, repoId }, 'Failed to get repo');
    throw err;
  }

  if (!repo) {
    throw Object.assign(new Error('Repo not found'), { status: 404 });
  }

  return repo;
};

// Validates input and deletes a repo
const handleDeleteRepo = async (workspaceId: string, repoId: string) => {
  if (!workspaceId || !repoId) {
    throw Object.assign(new Error('workspaceId and repoId are required'), { status: 400 });
  }

  // Validate ObjectId format before querying — Mongoose throws CastError otherwise
  assertValidObjectId(repoId, 'repoId')

  let deleted;

  try {
    deleted = await deleteRepo(workspaceId, repoId);
  } catch (err) {
    logger.error({ err, workspaceId, repoId }, 'Failed to delete repo');
    throw err;
  }

  if (!deleted) {
    throw Object.assign(new Error('Repo not found'), { status: 404 });
  }
};

export {
  handleListRepos,
  handleCreateRepo,
  handleGetRepo,
  handleDeleteRepo,
};