import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

// Shape of a doc block returned by Documentation Service
interface DocBlock {
  entityId: string;
  workspaceId: string;
  entityName: string;
  kind: string;
  filePath: string;
  docBlock: string;
  generatedAt: string;
}

// Fetches the doc block for a single entity.
// Returns null if not found (404) or if Doc Service is unavailable — non-fatal.
const getEntityDoc = async (
  workspaceId: string,
  entityId: string
): Promise<DocBlock | null> => {
  try {
    const response = await axios.get<{ doc: DocBlock }>(
      `${config.docService.url}/docs/${workspaceId}/entity/${encodeURIComponent(entityId)}`
    );
    return response.data.doc ?? null;
  } catch (err: any) {
    // 404 means doc hasn't been generated yet — not an error
    if (err.response?.status === 404) {
      return null;
    }
    logger.warn({ err, workspaceId, entityId }, 'Doc Service fetch failed — skipping doc block');
    return null;
  }
};

export { getEntityDoc, DocBlock };