import { runQuery } from '../db/client';
import { logger } from '../logger';

// Capitalises 'function' → 'Function' for use as a Neo4j node label
function toLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

// ENTITY_CREATED — ingestion found a new entity that did not exist before
// Creates a new node with validTo = null (currently active)
// MERGE on identity fields makes this idempotent — safe to replay
async function handleEntityCreated(payload: any): Promise<void> {
  const { name, filePath, repoId, workspaceId, commitHash, kind, language } = payload;
  const label = toLabel(kind);

  // MERGE on structural identity only — validFrom must NOT be in the match pattern
  // If validFrom were included, replaying with a different commitHash would create a duplicate node
  await runQuery(
    `MERGE (e:${label} {
       name: $name,
       filePath: $filePath,
       repoId: $repoId,
       workspaceId: $workspaceId
     })
     ON CREATE SET
       e.language  = $language,
       e.kind      = $kind,
       e.validFrom = $commitHash,
       e.validTo   = null,
       e.createdAt = timestamp()`,
    { name, filePath, repoId, workspaceId, commitHash, kind, language }
  );

  logger.info({ name, filePath, repoId, kind }, 'Entity created in graph');
}

// ENTITY_UPDATED — signature or body changed
// Step 1: close the current active version by setting validTo = commitHash
// Step 2: create a new version with validFrom = commitHash, validTo = null
// This is the temporal versioning pattern — old version is preserved for timeline queries
async function handleEntityUpdated(payload: any): Promise<void> {
  const { name, filePath, repoId, workspaceId, commitHash, kind } = payload;
  const label = toLabel(kind);

  // Close the currently active version
  await runQuery(
    `MATCH (e:${label} {
       name: $name,
       filePath: $filePath,
       repoId: $repoId,
       workspaceId: $workspaceId
     })
     WHERE e.validTo IS NULL
     SET e.validTo = $commitHash`,
    { name, filePath, repoId, workspaceId, commitHash }
  );

  // Insert the new version — carry language forward from the old node since
  // ENTITY_UPDATED payload does not include language (only ENTITY_CREATED does)
  await runQuery(
    `MATCH (old:${label} {
       name: $name,
       filePath: $filePath,
       repoId: $repoId,
       workspaceId: $workspaceId,
       validTo: $commitHash
     })
     CREATE (e:${label} {
       name: $name,
       filePath: $filePath,
       repoId: $repoId,
       workspaceId: $workspaceId,
       kind: $kind,
       language: old.language,
       validFrom: $commitHash,
       validTo: null,
       createdAt: timestamp()
     })`,
    { name, filePath, repoId, workspaceId, commitHash, kind }
  );

  logger.info({ name, filePath, repoId }, 'Entity updated in graph');
}

// ENTITY_DELETED — entity no longer exists in the file
// Closes the active version — never hard deletes
// The node remains in Neo4j with validTo set, queryable in timeline queries
async function handleEntityDeleted(payload: any): Promise<void> {
  const { name, filePath, repoId, workspaceId, commitHash } = payload;

  // We don't know the kind here — match across all label types by shared properties
  await runQuery(
    `MATCH (e {
       name: $name,
       filePath: $filePath,
       repoId: $repoId,
       workspaceId: $workspaceId
     })
     WHERE e.validTo IS NULL
     SET e.validTo = $commitHash`,
    { name, filePath, repoId, workspaceId, commitHash }
  );

  logger.info({ name, filePath, repoId }, 'Entity closed in graph');
}

export { handleEntityCreated, handleEntityUpdated, handleEntityDeleted };