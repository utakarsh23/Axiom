import { queryVector, VectorResult } from '../clients/vectorClient';
import { getEntityNeighbourhood } from '../clients/graphClient';
import { getEntityDoc } from '../clients/docClient';
import logger from '../logger';

// Shape of a fully enriched search result returned to the caller
interface SearchResult {
  entityId: string;
  entityName: string;
  kind: string;
  filePath: string;
  score: number;          // semantic similarity score from Vector Service
  docBlock: string | null; // LLM-generated documentation, null if not yet generated
  callers: string[];      // names of entities that call this entity (1-hop upstream)
  callees: string[];      // names of entities this entity calls (1-hop downstream)
}

// Shape of the incoming search request
interface SearchRequest {
  workspaceId: string;
  query: string;
  topK?: number;   // number of vector results to fetch — defaults to 10
}

// Validates the search request before processing
const validateSearchRequest = (req: SearchRequest): void => {
  if (!req.workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }
  if (!req.query || req.query.trim().length === 0) {
    throw Object.assign(new Error('query is required'), { status: 400 });
  }
};

// Enriches a single vector result with graph neighbourhood and doc block.
// Graph and doc fetches run in parallel — both are non-fatal on failure.
const enrichResult = async (
  hit: VectorResult,
  workspaceId: string
): Promise<SearchResult> => {
  // Fetch neighbourhood and doc block concurrently — independent calls
  const [neighbourhood, doc] = await Promise.all([
    getEntityNeighbourhood(workspaceId, hit.entityName),
    getEntityDoc(workspaceId, hit.entityId),
  ]);

  return {
    entityId:   hit.entityId,
    entityName: hit.entityName,
    kind:       hit.kind,
    filePath:   hit.filePath,
    score:      hit.score,
    docBlock:   doc?.docBlock ?? null,
    callers:    neighbourhood.upstream.map((n) => n.name),
    callees:    neighbourhood.downstream.map((n) => n.name),
  };
};

// Orchestrates the full search pipeline:
// 1. Vector Service — semantic similarity search to get candidate entities
// 2. Graph Service + Doc Service — enrich each candidate in parallel
// Returns results sorted by descending similarity score.
const handleSearch = async (req: SearchRequest): Promise<SearchResult[]> => {
  validateSearchRequest(req);

  const topK = req.topK ?? 10;

  let vectorHits: VectorResult[];

  try {
    vectorHits = await queryVector(req.workspaceId, req.query, topK);
  } catch (err) {
    logger.error({ err, workspaceId: req.workspaceId }, 'Vector search failed');
    throw err;
  }

  if (vectorHits.length === 0) {
    return [];
  }

  // Enrich all hits concurrently — graph + doc fetches per hit run in parallel
  const enriched = await Promise.all(
    vectorHits.map((hit) => enrichResult(hit, req.workspaceId))
  );

  // Sort by descending score — highest similarity first
  enriched.sort((a, b) => b.score - a.score);

  logger.info(
    { workspaceId: req.workspaceId, query: req.query, resultCount: enriched.length },
    'Search completed'
  );

  return enriched;
};

export { handleSearch, SearchRequest, SearchResult };