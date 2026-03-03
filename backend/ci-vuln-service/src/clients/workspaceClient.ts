import axios from 'axios';
import { config } from '../config';
import logger from '../logger';
import { IRulebook } from '../types/rulebook';

// Fetches the rulebook for a workspace from Workspace Service.
// Returns null if no rulebook has been defined — Tier 2b is skipped in that case.
const getRulebook = async (workspaceId: string): Promise<IRulebook | null> => {
  try {
    const response = await axios.get<{ rulebook: IRulebook | null }>(
      `${config.services.workspace}/workspaces/${workspaceId}/rulebook`
    );
    return response.data.rulebook;
  } catch (err) {
    // Non-fatal — if Workspace Service is down, skip rulebook checks entirely
    logger.warn({ err, workspaceId }, 'Failed to fetch rulebook — Tier 2b will be skipped');
    return null;
  }
};

export { getRulebook };