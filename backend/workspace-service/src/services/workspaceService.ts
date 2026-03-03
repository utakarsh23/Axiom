import mongoose from 'mongoose';
import { WorkspaceModel, IRulebook } from '../model/workspaceModel';
import logger from '../logger';

// Helper — returns 400 error for invalid MongoDB ObjectId format
const assertValidObjectId = (id: string, label: string): void => {
  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error(`Invalid ${label} format`), { status: 400 });
  }
};

// List all workspaces belonging to a user
const listWorkspaces = async (userId: string) => {
  return WorkspaceModel.find({ userId }).lean();
};

// Fetch a single workspace by id
const getWorkspace = async (workspaceId: string) => {
  return WorkspaceModel.findById(workspaceId).lean();
};

// Create a new workspace for a user
const createWorkspace = async (userId: string, name: string) => {
  const workspace = new WorkspaceModel({ userId, name });
  return workspace.save();
};

// Delete a workspace by id
const deleteWorkspace = async (workspaceId: string) => {
  return WorkspaceModel.findByIdAndDelete(workspaceId);
};

// Validates userId from header and lists their workspaces
const handleListWorkspaces = async (userId: string) => {
  if (!userId) {
    throw Object.assign(new Error('x-user-id header is required'), { status: 400 });
  }

  try {
    return await listWorkspaces(userId);
  } catch (err) {
    logger.error({ err, userId }, 'Failed to list workspaces');
    throw err;
  }
};

// Validates input and creates a workspace
const handleCreateWorkspace = async (userId: string, name: string) => {
  if (!userId) {
    throw Object.assign(new Error('x-user-id header is required'), { status: 400 });
  }
  if (!name || name.trim().length === 0) {
    throw Object.assign(new Error('name is required'), { status: 400 });
  }

  try {
    return await createWorkspace(userId, name.trim());
  } catch (err: any) {
    // Duplicate key — workspace name already exists for this user
    if (err.code === 11000) {
      throw Object.assign(new Error('Workspace name already exists'), { status: 409 });
    }
    logger.error({ err, userId }, 'Failed to create workspace');
    throw err;
  }
};

// Validates workspaceId and returns the workspace
const handleGetWorkspace = async (workspaceId: string) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }

  // Validate ObjectId format before querying — Mongoose throws CastError otherwise
  assertValidObjectId(workspaceId, 'workspaceId');

  let workspace;

  try {
    workspace = await getWorkspace(workspaceId);
  } catch (err) {
    logger.error({ err, workspaceId }, 'Failed to get workspace');
    throw err;
  }

  if (!workspace) {
    throw Object.assign(new Error('Workspace not found'), { status: 404 });
  }

  return workspace;
};

// Validates workspaceId and deletes the workspace
const handleDeleteWorkspace = async (workspaceId: string) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }

  // Validate ObjectId format before querying — Mongoose throws CastError otherwise
  assertValidObjectId(workspaceId, 'workspaceId');

  let deleted;

  try {
    deleted = await deleteWorkspace(workspaceId);
  } catch (err) {
    logger.error({ err, workspaceId }, 'Failed to delete workspace');
    throw err;
  }

  if (!deleted) {
    throw Object.assign(new Error('Workspace not found'), { status: 404 });
  }
};

// Returns the workspace rulebook — returns null if not set (not an error)
const handleGetRulebook = async (workspaceId: string) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }

  assertValidObjectId(workspaceId, 'workspaceId');

  let workspace;

  try {
    workspace = await WorkspaceModel.findById(workspaceId).select('rulebook').lean();
  } catch (err) {
    logger.error({ err, workspaceId }, 'Failed to get rulebook');
    throw err;
  }

  if (!workspace) {
    throw Object.assign(new Error('Workspace not found'), { status: 404 });
  }

  // rulebook may be undefined if never set — return null explicitly
  return workspace.rulebook ?? null;
};

// Replaces the workspace rulebook entirely — partial update not supported
// CI Service always reads the full rulebook before running checks
const handleUpdateRulebook = async (workspaceId: string, rulebook: IRulebook) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }
  if (!rulebook || typeof rulebook !== 'object') {
    throw Object.assign(new Error('rulebook body is required'), { status: 400 });
  }

  assertValidObjectId(workspaceId, 'workspaceId');

  let updated;

  try {
    updated = await WorkspaceModel.findByIdAndUpdate(
      workspaceId,
      { $set: { rulebook } },
      { new: true, runValidators: true }
    ).lean();
  } catch (err) {
    logger.error({ err, workspaceId }, 'Failed to update rulebook');
    throw err;
  }

  if (!updated) {
    throw Object.assign(new Error('Workspace not found'), { status: 404 });
  }

  return updated.rulebook;
};

export {
  handleListWorkspaces,
  handleCreateWorkspace,
  handleGetWorkspace,
  handleDeleteWorkspace,
  handleGetRulebook,
  handleUpdateRulebook,
};