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
  code: string;
}

// Sends the query embedding request to Vector Service.
// Returns ranked results by semantic similarity to the query text.
const queryVector = async (
  workspaceId: string,
  queryText: string,
  topK: number = 10
): Promise<VectorResult[]> => {
  try {
    const response = await axios.post<{ results: any[] }>(
      `${config.vectorService.url}/vector/query`,
      { workspaceId, query: queryText, topK }
    );

    // Vector Service returns { entityId, score, metadata, code }
    // Map metadata fields to the flat VectorResult shape
    return (response.data.results ?? []).map((r: any) => ({
      entityId:    r.entityId,
      workspaceId: r.metadata?.workspaceId ?? workspaceId,
      entityName:  r.metadata?.entityName ?? r.entityName ?? '',
      filePath:    r.metadata?.filePath ?? r.filePath ?? '',
      kind:        r.metadata?.kind ?? r.kind ?? '',
      score:       r.score ?? 0,
      code:        r.code ?? '',
    }));
  } catch (err) {
    logger.error({ err, workspaceId }, 'Vector Service query failed');
    throw err;
  }
};

export { queryVector, VectorResult };