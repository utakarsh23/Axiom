import { ChromaClient, Collection } from 'chromadb';
import { config } from '../config';
import { logger } from '../logger';

let client: ChromaClient;

async function connectDB(): Promise<void> {
  client = new ChromaClient({ path: config.chroma.url });
  await client.heartbeat();
  logger.info('Connected to ChromaDB');
}

async function disconnectDB(): Promise<void> {
  logger.info('ChromaDB client closed');
}

// Returns the collection for a workspace, creating it if it does not exist.
// Each workspace gets its own isolated collection: workspace-{workspaceId}
// getOrCreateCollection is idempotent — safe to call on every upsert.
async function getCollection(workspaceId: string): Promise<Collection> {
  const name = `workspace-${workspaceId}`;
  return client.getOrCreateCollection({
    name,
    // cosine distance required — vectorService score formula (1 - distance) is only
    // valid when distance is in [0, 2] range, which cosine guarantees
    metadata: { workspaceId, 'hnsw:space': 'cosine' },
  });
}

export { connectDB, disconnectDB, getCollection };