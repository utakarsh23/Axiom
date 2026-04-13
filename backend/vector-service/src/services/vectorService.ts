import { getCollection } from '../db/client';
import { config } from '../config';
import { logger } from '../logger';

// Result shape returned to the caller for each matched entity
interface VectorQueryResult {
  entityId: string;
  score: number;
  metadata: Record<string, string>;
  code: string;
}

// Request shape from the router
interface VectorQueryRequest {
  workspaceId: string;
  query: string;
  topK?: number;
}

// Request shape for fetching entities by their IDs
interface EntityFetchRequest {
  workspaceId: string;
  entityIds: string[];
}

// Result shape for each fetched entity
interface EntityFetchResult {
  entityId: string;
  code: string;
  metadata: Record<string, string>;
}

// Generates an embedding for the query text by calling LLM Service /llm/embed.
// The same embedding model is used for both indexing and querying —
// this ensures the query vector lives in the same space as stored vectors.
async function fetchQueryEmbedding(queryText: string): Promise<number[]> {
  const response = await fetch(`${config.llmService.url}/llm/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: queryText }),
  });

  if (!response.ok) {
    throw new Error(`LLM Service /llm/embed responded with ${response.status}`);
  }

  const json = await response.json() as { vector: number[] };
  return json.vector;
}

// Performs a cosine similarity search in the workspace-scoped Chroma collection.
// Returns the top-K most similar entities — entityIds, scores, metadata, and raw code.
// All results are scoped to the given workspaceId — no cross-workspace leakage.
async function queryVector(
  workspaceId: string,
  queryText: string,
  topK: number = 10
): Promise<VectorQueryResult[]> {
  try {
    const embedding = await fetchQueryEmbedding(queryText);
    const collection = await getCollection(workspaceId);

    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      // Include metadata and documents so callers get full context without extra lookups
      include: ['metadatas', 'documents', 'distances'],
    });

    // Chroma returns parallel arrays — zip them into a clean result array
    const ids = results.ids[0] ?? [];
    const distances = results.distances?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];
    const documents = results.documents?.[0] ?? [];

    const queryResults: VectorQueryResult[] = ids.map((id, i) => ({
      entityId: id,
      // Chroma returns L2 distance — convert to similarity score (1 = identical, 0 = orthogonal)
      score: 1 - (distances[i] ?? 0),
      metadata: (metadatas[i] ?? {}) as Record<string, string>,
      code: documents[i] ?? '',
    }));

    logger.info({ workspaceId, topK, count: queryResults.length }, 'Vector query completed');
    return queryResults;
  } catch (err) {
    logger.error({ err, workspaceId }, 'Vector query failed');
    throw err;
  }
}

// Entry point called by the router — validates input and delegates to queryVector.
// All business logic stays here, router only handles HTTP plumbing.
async function handleVectorQuery(body: VectorQueryRequest): Promise<VectorQueryResult[]> {
  const { workspaceId, query, topK } = body;

  if (!workspaceId || !query) {
    throw Object.assign(new Error('workspaceId and query are required'), { status: 400 });
  }

  return queryVector(workspaceId, query, topK ?? 10);
}


async function fetchEntitiesByIds(
  workspaceId: string,
  entityIds: string[]
): Promise<EntityFetchResult[]> {
  try {
    const collection = await getCollection(workspaceId);
    const uniqueIds = Array.from(new Set(entityIds));
    const results = await collection.get({
      ids: uniqueIds,
      include: ['metadatas', 'documents'],
    });
    const fetchResults: EntityFetchResult[] = results.ids.map((id, i) => ({
      entityId: id,
      code: results.documents?.[i] ?? '',
      metadata: (results.metadatas?.[i] ?? {}) as Record<string, string>,
    }));
    logger.info({ workspaceId, requested: entityIds.length, found: fetchResults.length }, 'Entity fetch by IDs completed');
    return fetchResults;
  } catch (err) {
    logger.error({ err, workspaceId }, 'Entity fetch by IDs failed');
    throw err;
  }
}

// Entry point called by the router — validates input and delegates to fetchEntitiesByIds.
async function handleEntityFetch(body: EntityFetchRequest): Promise<EntityFetchResult[]> {
  const { workspaceId, entityIds } = body;
  if (!workspaceId || !entityIds?.length) {
    throw Object.assign(new Error('workspaceId and entityIds are required'), { status: 400 });
  }
  return fetchEntitiesByIds(workspaceId, entityIds);
}





export { queryVector, handleVectorQuery, handleEntityFetch, fetchEntitiesByIds, EntityFetchResult, EntityFetchRequest, VectorQueryResult, VectorQueryRequest };