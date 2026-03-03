import { runQuery } from '../db/client';
import { logger } from '../logger';

// Capitalises 'function' → 'Function' for use as a Neo4j node label
function toLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

// ENTITY_CREATED — ingestion found a new entity that did not exist before
// Creates a new node with validTo = null (currently active)
// MERGE on identity fields makes this idempotent — safe to replay
// Payload uses entityId + entityName (matching diff engine output)
async function handleEntityCreated(payload: any): Promise<void> {
  const { entityId, entityName, filePath, repoId, workspaceId, commitHash, kind, language } = payload;
  const label = toLabel(kind);

  // MERGE on structural identity only — validFrom must NOT be in the match pattern
  // If validFrom were included, replaying with a different commitHash would create a duplicate node
  await runQuery(
    `MERGE (e:${label} {
       entityId: $entityId
     })
     ON CREATE SET
       e.name       = $entityName,
       e.filePath   = $filePath,
       e.repoId     = $repoId,
       e.workspaceId = $workspaceId,
       e.language   = $language,
       e.kind       = $kind,
       e.validFrom  = $commitHash,
       e.validTo    = null,
       e.createdAt  = timestamp()
     ON MATCH SET
       e.name       = $entityName,
       e.filePath   = $filePath`,
    { entityId, entityName, filePath, repoId, workspaceId, commitHash, kind, language }
  );

  logger.info({ entityName, filePath, repoId, kind }, 'Entity created in graph');
}

// ENTITY_UPDATED — signature or body changed
// Step 1: close the current active version by setting validTo = commitHash
// Step 2: create a new version with validFrom = commitHash, validTo = null
// This is the temporal versioning pattern — old version is preserved for timeline queries
async function handleEntityUpdated(payload: any): Promise<void> {
  const { entityId, entityName, filePath, repoId, workspaceId, commitHash, kind, language } = payload;
  const label = toLabel(kind);

  // Close the currently active version
  await runQuery(
    `MATCH (e:${label} { entityId: $entityId })
     WHERE e.validTo IS NULL
     SET e.validTo = $commitHash`,
    { entityId, commitHash }
  );

  // Insert the new version — language carried forward from old node if not provided
  await runQuery(
    `MATCH (old:${label} { entityId: $entityId, validTo: $commitHash })
     CREATE (e:${label} {
       entityId:    $entityId,
       name:        $entityName,
       filePath:    $filePath,
       repoId:      $repoId,
       workspaceId: $workspaceId,
       kind:        $kind,
       language:    COALESCE($language, old.language),
       validFrom:   $commitHash,
       validTo:     null,
       createdAt:   timestamp()
     })`,
    { entityId, entityName, filePath, repoId, workspaceId, commitHash, kind, language: language ?? null }
  );

  logger.info({ entityName, filePath, repoId }, 'Entity updated in graph');
}

// ENTITY_DELETED — entity no longer exists in the file
// Closes the active version — never hard deletes
// The node remains in Neo4j with validTo set, queryable in timeline queries
async function handleEntityDeleted(payload: any): Promise<void> {
  const { entityId, commitHash } = payload;

  // Match by stable entityId — avoids needing to know the label
  await runQuery(
    `MATCH (e { entityId: $entityId })
     WHERE e.validTo IS NULL
     SET e.validTo = $commitHash`,
    { entityId, commitHash }
  );

  logger.info({ entityId }, 'Entity closed in graph');
}

export { handleEntityCreated, handleEntityUpdated, handleEntityDeleted };