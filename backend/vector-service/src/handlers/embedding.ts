import { getCollection } from '../db/client';
import { config } from '../config';
import { logger } from '../logger';

// Shape of the EMBEDDING_REQUIRED and ENTITY_UPDATED payloads from Ingestion
interface EmbeddingPayload {
  entityId: string;
  workspaceId: string;
  repoId: string;
  filePath: string;
  entityName: string;
  kind: string;
  language: string;
  code: string;
}

// Shape of the ENTITY_DELETED payload from Ingestion
interface DeletePayload {
  entityId: string;
  workspaceId: string;
}

// Calls LLM Service /llm/embed to generate an embedding vector for the given code.
// LLM Service owns the embedding model — Vector Service never runs inference itself.
async function fetchEmbedding(code: string): Promise<number[]> {
  const response = await fetch(`${config.llmService.url}/llm/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`LLM Service /llm/embed responded with ${response.status}`);
  }

  const json = await response.json() as { vector: number[] };
  return json.vector;
}

// Handles EMBEDDING_REQUIRED — emitted by Ingestion for every new entity.
// Fetches embedding from LLM Service and upserts into the workspace-scoped
// Chroma collection. Upsert is idempotent — safe to replay.
async function handleEmbeddingRequired(payload: unknown): Promise<void> {
  const { entityId, workspaceId, repoId, filePath, entityName, kind, language, code } =
    payload as EmbeddingPayload;

  try {
    const vector = await fetchEmbedding(code);
    const collection = await getCollection(workspaceId);

    await collection.upsert({
      ids: [entityId],
      embeddings: [vector],
      // Metadata stored alongside the vector for filtering and result enrichment
      metadatas: [{ entityId, workspaceId, repoId, filePath, entityName, kind, language }],
      // Raw code stored as the document — returned in query results for context assembly
      documents: [code],
    });

    logger.info({ entityId, workspaceId }, 'Embedding upserted');
  } catch (err) {
    logger.error({ err, entityId, workspaceId }, 'Failed to upsert embedding');
    throw err;
  }
}

// Handles ENTITY_UPDATED — re-generates and overwrites the existing embedding.
// Chroma upsert on matching id overwrites in place — no explicit delete needed.
async function handleEntityUpdated(payload: unknown): Promise<void> {
  const { entityId, workspaceId } = payload as EmbeddingPayload;

  try {
    // Re-uses the full upsert path — same logic, same idempotency guarantees
    await handleEmbeddingRequired(payload);
    logger.info({ entityId, workspaceId }, 'Embedding re-upserted on entity update');
  } catch (err) {
    logger.error({ err, entityId, workspaceId }, 'Failed to re-upsert embedding on update');
    throw err;
  }
}

// Handles ENTITY_DELETED — removes the entity's embedding from Chroma.
// The workspace collection itself is preserved — only this entity's vector is removed.
async function handleEntityDeleted(payload: unknown): Promise<void> {
  const { entityId, workspaceId } = payload as DeletePayload;

  try {
    const collection = await getCollection(workspaceId);
    await collection.delete({ ids: [entityId] });
    logger.info({ entityId, workspaceId }, 'Embedding deleted');
  } catch (err) {
    logger.error({ err, entityId, workspaceId }, 'Failed to delete embedding');
    throw err;
  }
}

export { handleEmbeddingRequired, handleEntityUpdated, handleEntityDeleted };