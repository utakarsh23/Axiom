import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

// Shape of a single result returned by Vector Service
interface VectorResult {
  entityId: string;
  workspaceId: string;
  entityName: string;
  filePath: string;
  kind: string;
  score: number;   // cosine similarity — higher is more relevant
}

// Sends the query embedding request to Vector Service.
// Returns ranked results by semantic similarity to the query text.
const queryVector = async (
  workspaceId: string,
  queryText: string,
  topK: number = 10
): Promise<VectorResult[]> => {
  try {
    const response = await axios.post<{ results: VectorResult[] }>(
      `${config.vectorService.url}/vector/query`,
      { workspaceId, queryText, topK }
    );
    return response.data.results ?? [];
  } catch (err) {
    logger.error({ err, workspaceId }, 'Vector Service query failed');
    throw err;
  }
};

export { queryVector, VectorResult };