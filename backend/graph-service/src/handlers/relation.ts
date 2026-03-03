import { runQuery } from '../db/client';
import { logger } from '../logger';

// RELATION_ADDED — a call site appeared between caller and callee
// Decision logic:
//   1. Check if callee exists as a known entity in this workspace
//   2. If yes → create a CALLS edge (internal, cross-file or cross-repo)
//   3. If no  → merge an ExternalService node + create a CALLS_EXTERNAL edge
async function handleRelationAdded(payload: any): Promise<void> {
  const { callerName, calleeName, filePath, repoId, workspaceId, commitHash } = payload;

  // Check if callee is a known entity in this workspace
  const records = await runQuery(
    `MATCH (e { name: $calleeName, workspaceId: $workspaceId })
     WHERE e.validTo IS NULL
     RETURN e LIMIT 1`,
    { calleeName, workspaceId }
  );

  if (records.length > 0) {
    // MERGE on structural identity only — validFrom must NOT be in the MERGE pattern
    // If validFrom were included, replaying with a different commitHash creates a duplicate edge
    await runQuery(
      `MATCH (caller { name: $callerName, filePath: $filePath, repoId: $repoId, workspaceId: $workspaceId })
       WHERE caller.validTo IS NULL
       MATCH (callee { name: $calleeName, workspaceId: $workspaceId })
       WHERE callee.validTo IS NULL
       MERGE (caller)-[r:CALLS { workspaceId: $workspaceId }]->(callee)
       ON CREATE SET r.validFrom = $commitHash, r.validTo = null`,
      { callerName, calleeName, filePath, repoId, workspaceId, commitHash }
    );

    logger.info({ callerName, calleeName, repoId }, 'CALLS edge created');
  } else {
    // Callee is external (npm package, stdlib, etc.)
    // MERGE ensures we only create one ExternalService node per name per workspace
    await runQuery(
      `MERGE (ext:ExternalService { name: $calleeName, workspaceId: $workspaceId })
       ON CREATE SET ext.kind = 'external', ext.createdAt = timestamp()`,
      { calleeName, workspaceId }
    );

    await runQuery(
      `MATCH (caller { name: $callerName, filePath: $filePath, repoId: $repoId, workspaceId: $workspaceId })
       WHERE caller.validTo IS NULL
       MATCH (ext:ExternalService { name: $calleeName, workspaceId: $workspaceId })
       MERGE (caller)-[r:CALLS_EXTERNAL { workspaceId: $workspaceId }]->(ext)
       ON CREATE SET r.validFrom = $commitHash, r.validTo = null`,
      { callerName, calleeName, filePath, repoId, workspaceId, commitHash }
    );

    logger.info({ callerName, calleeName }, 'CALLS_EXTERNAL edge created');
  }
}

// RELATION_REMOVED — a call site was removed
// Closes the active CALLS or CALLS_EXTERNAL edge — never hard deletes
// Tries both edge types since we don't know which it is from the payload alone
async function handleRelationRemoved(payload: any): Promise<void> {
  const { callerName, calleeName, filePath, repoId, workspaceId, commitHash } = payload;

  // Close CALLS edge if it exists
  await runQuery(
    `MATCH (caller { name: $callerName, filePath: $filePath, repoId: $repoId, workspaceId: $workspaceId })
     -[r:CALLS { workspaceId: $workspaceId }]->
     (callee { name: $calleeName, workspaceId: $workspaceId })
     WHERE r.validTo IS NULL
     SET r.validTo = $commitHash`,
    { callerName, calleeName, filePath, repoId, workspaceId, commitHash }
  );

  // Close CALLS_EXTERNAL edge if it exists
  await runQuery(
    `MATCH (caller { name: $callerName, filePath: $filePath, repoId: $repoId, workspaceId: $workspaceId })
     -[r:CALLS_EXTERNAL { workspaceId: $workspaceId }]->
     (ext:ExternalService { name: $calleeName, workspaceId: $workspaceId })
     WHERE r.validTo IS NULL
     SET r.validTo = $commitHash`,
    { callerName, calleeName, filePath, repoId, workspaceId, commitHash }
  );

  logger.info({ callerName, calleeName, repoId }, 'Relation closed in graph');
}

export { handleRelationAdded, handleRelationRemoved };