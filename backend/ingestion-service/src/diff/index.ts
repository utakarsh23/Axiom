import { ExtractedEntity, ExtractedCall } from '../extractor/types';
import { EntityHashes } from '../hasher/index';

export type DiffEventType =
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'RELATION_ADDED'
  | 'RELATION_REMOVED'
  | 'EMBEDDING_REQUIRED';

export interface DiffEvent {
  type: DiffEventType;
  payload: Record<string, any>;
}

export interface DiffResult {
  events: DiffEvent[];
}

// oldCallLists: map of entityName → stored callList array from MongoDB
// This enables precise RELATION_ADDED / RELATION_REMOVED diffing
// instead of re-emitting all current calls on every callListHash change
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

    if (!oldHash) {
      // New entity — did not exist in previous commit
      events.push({
        type: 'ENTITY_CREATED',
        payload: { name, filePath, repoId, workspaceId, commitHash, kind: entity.kind, language: entity.language },
      });
      events.push({
        type: 'EMBEDDING_REQUIRED',
        payload: { name, filePath, repoId, workspaceId, rawBody: entity.rawBody },
      });

      // All calls from this entity are new relations
      for (const callee of newCallLists.get(name) ?? []) {
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
        payload: { name, filePath, repoId, workspaceId, commitHash, kind: entity.kind },
      });
      events.push({
        type: 'EMBEDDING_REQUIRED',
        payload: { name, filePath, repoId, workspaceId, rawBody: entity.rawBody },
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
      events.push({
        type: 'ENTITY_DELETED',
        payload: { name, filePath, repoId, workspaceId, commitHash },
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

export { computeDiff };