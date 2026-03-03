import { createHash } from 'crypto';
import { ExtractedEntity, ExtractedCall } from '../extractor/types';
import { EntityHashes } from '../hasher/index';

export type DiffEventType =
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'RELATION_ADDED'
  | 'RELATION_REMOVED'
  | 'EMBEDDING_REQUIRED'
  | 'DOC_REQUIRED';

export interface DiffEvent {
  type: DiffEventType;
  payload: Record<string, any>;
}

export interface DiffResult {
  events: DiffEvent[];
}

// Generates a stable, deterministic entity ID from its structural identity.
// This ID is used across Graph, Vector, and Doc services to reference the same entity.
// Changing workspaceId, repoId, filePath, or name produces a different ID — correct.
function makeEntityId(workspaceId: string, repoId: string, filePath: string, entityName: string): string {
  return createHash('sha256')
    .update(`${workspaceId}:${repoId}:${filePath}:${entityName}`)
    .digest('hex')
    .slice(0, 24); // shorten for readability while maintaining uniqueness
}

// callLists per entity — built from the full calls array for the file
// oldCallLists: stored callList from MongoDB for precise RELATION_ADDED / RELATION_REMOVED diffing
function computeDiff(
  filePath: string,
  repoId: string,
  workspaceId: string,
  commitHash: string,
  newEntities: ExtractedEntity[],
  newCalls: ExtractedCall[],
  newHashes: Map<string, EntityHashes>,
  oldHashes: Map<string, EntityHashes>,
  oldCallLists: Map<string, string[]>,
): DiffResult {
  const events: DiffEvent[] = [];

  const newEntityMap = new Map<string, ExtractedEntity>();
  for (const entity of newEntities) {
    newEntityMap.set(entity.name, entity);
  }

  // Build new call lists per entity for easy lookup
  const newCallLists = new Map<string, string[]>();
  for (const entity of newEntities) {
    const callees = newCalls
      .filter(c => c.callerName === entity.name)
      .map(c => c.calleeName);
    newCallLists.set(entity.name, callees);
  }

  // 1. Find created and updated entities
  for (const [name, newHash] of newHashes) {
    const oldHash = oldHashes.get(name);
    const entity = newEntityMap.get(name)!;
    const entityId = makeEntityId(workspaceId, repoId, filePath, name);
    const callList = newCallLists.get(name) ?? [];

    if (!oldHash) {
      // New entity — did not exist in previous commit
      events.push({
        type: 'ENTITY_CREATED',
        payload: {
          entityId, entityName: name, kind: entity.kind, language: entity.language,
          filePath, repoId, workspaceId, commitHash,
        },
      });
      events.push({
        type: 'EMBEDDING_REQUIRED',
        payload: {
          entityId, entityName: name, kind: entity.kind, language: entity.language,
          filePath, repoId, workspaceId, code: entity.rawBody,
        },
      });
      events.push({
        type: 'DOC_REQUIRED',
        payload: {
          entityId, entityName: name, kind: entity.kind, language: entity.language,
          filePath, repoId, workspaceId, commitHash,
          code: entity.rawBody,
          callList,
        },
      });

      // All calls from this entity are new relations
      for (const callee of callList) {
        events.push({
          type: 'RELATION_ADDED',
          payload: { callerName: name, calleeName: callee, filePath, repoId, workspaceId, commitHash },
        });
      }
      continue;
    }

    const signatureChanged = oldHash.signatureHash !== newHash.signatureHash;
    const bodyChanged = oldHash.bodyHash !== newHash.bodyHash;
    const callsChanged = oldHash.callListHash !== newHash.callListHash;

    if (signatureChanged || bodyChanged) {
      events.push({
        type: 'ENTITY_UPDATED',
        payload: {
          entityId, entityName: name, kind: entity.kind, language: entity.language,
          filePath, repoId, workspaceId, commitHash,
          code: entity.rawBody,
          callList,
        },
      });
      events.push({
        type: 'EMBEDDING_REQUIRED',
        payload: {
          entityId, entityName: name, kind: entity.kind, language: entity.language,
          filePath, repoId, workspaceId, code: entity.rawBody,
        },
      });
      events.push({
        type: 'DOC_REQUIRED',
        payload: {
          entityId, entityName: name, kind: entity.kind, language: entity.language,
          filePath, repoId, workspaceId, commitHash,
          code: entity.rawBody,
          callList,
        },
      });
    }

    if (callsChanged) {
      const oldCallSet = new Set(oldCallLists.get(name) ?? []);
      const newCallSet = new Set(newCallLists.get(name) ?? []);

      // Calls in new but not in old → added
      for (const callee of newCallSet) {
        if (!oldCallSet.has(callee)) {
          events.push({
            type: 'RELATION_ADDED',
            payload: { callerName: name, calleeName: callee, filePath, repoId, workspaceId, commitHash },
          });
        }
      }

      // Calls in old but not in new → removed
      for (const callee of oldCallSet) {
        if (!newCallSet.has(callee)) {
          events.push({
            type: 'RELATION_REMOVED',
            payload: { callerName: name, calleeName: callee, filePath, repoId, workspaceId },
          });
        }
      }
    }
  }

  // 2. Find deleted entities
  for (const [name] of oldHashes) {
    if (!newHashes.has(name)) {
      const entityId = makeEntityId(workspaceId, repoId, filePath, name);

      events.push({
        type: 'ENTITY_DELETED',
        payload: { entityId, entityName: name, filePath, repoId, workspaceId, commitHash },
      });

      // All relations from this entity are removed
      for (const callee of oldCallLists.get(name) ?? []) {
        events.push({
          type: 'RELATION_REMOVED',
          payload: { callerName: name, calleeName: callee, filePath, repoId, workspaceId },
        });
      }
    }
  }

  return { events };
}

export { computeDiff, makeEntityId };