import { DocBlockModel } from '../model/docBlockModel';
import {logger} from '../logger';

// Fetch all doc blocks for a workspace
const getWorkspaceDocs = async (workspaceId: string) => {
  return DocBlockModel.find({ workspaceId }).lean();
};

// Fetch a single doc block by entityId within a workspace
const getEntityDoc = async (workspaceId: string, entityId: string) => {
  return DocBlockModel.findOne({ entityId, workspaceId }).lean();
};

// Validate and return all docs for a workspace
const handleGetWorkspaceDocs = async (workspaceId: string) => {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }

  try {
    const docs = await getWorkspaceDocs(workspaceId);
    return docs;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch workspace docs');
    throw err;
  }
};

// Validate and return a single entity doc
const handleGetEntityDoc = async (workspaceId: string, entityId: string) => {
  if (!workspaceId || !entityId) {
    throw Object.assign(new Error('workspaceId and entityId are required'), { status: 400 });
  }

  let doc;

  try {
    doc = await getEntityDoc(workspaceId, entityId);
  } catch (err) {
    // Only log as error for actual DB failures, not expected not-found cases
    logger.error({ err }, 'Failed to fetch entity doc');
    throw err;
  }

  // Checked outside the catch so a 404 is not mistakenly logged as a DB error
  if (!doc) {
    throw Object.assign(new Error('Doc block not found'), { status: 404 });
  }

  return doc;
};

export { handleGetWorkspaceDocs, handleGetEntityDoc };