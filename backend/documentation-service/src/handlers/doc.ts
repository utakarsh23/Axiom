import axios from 'axios';
import { DocBlockModel } from '../model/docBlockModel';
import { config } from '../config';
import { logger } from '../logger';

// Shape of the DOC_REQUIRED and ENTITY_UPDATED payloads from Ingestion
interface DocPayload {
  entityId: string;
  workspaceId: string;
  repoId: string;
  filePath: string;
  entityName: string;
  kind: string;
  language: string;
  code: string;
  callList: string[];   // names of entities this entity calls — from Ingestion hash store
  commitHash: string;
}

// Shape of the ENTITY_DELETED payload from Ingestion
interface DeletePayload {
  entityId: string;
  workspaceId: string;
  entityName: string;
}

// Shape of a caller node returned by Graph Service impact endpoint
interface CallerEntity {
  name: string;
  entityId: string;
  filePath: string;
  repoId: string;
  kind: string;
  language: string;
  code: string;
}

// Fetches 1-hop callers of the given entity from Graph Service.
// Used to determine which doc blocks need to be regenerated when an entity changes.
// Returns empty array on failure — caller regeneration is best-effort, not critical.
async function fetchCallers(workspaceId: string, entityName: string): Promise<CallerEntity[]> {
  try {
    const url = `${config.graphService.url}/graph/${workspaceId}/impact/${entityName}`;
    const response = await axios.get<{ upstream: CallerEntity[] }>(url);
    // upstream = entities that call this entity (1-hop callers)
    return response.data.upstream ?? [];
  } catch (err) {
    logger.warn({ err, workspaceId, entityName }, 'Failed to fetch callers from Graph Service — skipping caller regeneration');
    return [];
  }
}

// Calls LLM Service /llm/explain to generate a documentation block.
// Context includes the entity's own code, its call list, and optional caller names.
// LLM Service is stateless — we send everything it needs in the request body.
async function generateDocBlock(
  payload: DocPayload,
  callerNames: string[]
): Promise<string> {
  const context = {
    entityName: payload.entityName,
    kind: payload.kind,
    language: payload.language,
    filePath: payload.filePath,
    code: payload.code,
    // What this entity calls — gives LLM outbound dependency context
    callList: payload.callList,
    // What calls this entity — gives LLM inbound usage context
    calledBy: callerNames,
  };

  try {
    const response = await axios.post<{ explanation: string }>(
      `${config.llmService.url}/llm/explain`,
      { context }
    );
    return response.data.explanation;
  } catch (err) {
    logger.error({ err, entityName: payload.entityName }, 'LLM Service failed to generate doc block');
    throw err;
  }
}

// Upserts a doc block for the given entity in MongoDB.
// Uses findOneAndUpdate with upsert:true so it is safe to call on both
// create and update — no duplicate doc blocks, no manual existence check.
async function upsertDocBlock(payload: DocPayload, docBlock: string): Promise<void> {
  try {
    await DocBlockModel.findOneAndUpdate(
      // Match on compound key — entityId + workspaceId
      { entityId: payload.entityId, workspaceId: payload.workspaceId },
      {
        entityId:    payload.entityId,
        workspaceId: payload.workspaceId,
        repoId:      payload.repoId,
        filePath:    payload.filePath,
        entityName:  payload.entityName,
        kind:        payload.kind,
        docBlock,
        commitHash:  payload.commitHash,
        generatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error({ err, entityId: payload.entityId }, 'Failed to upsert doc block to MongoDB');
    throw err;
  }
}

// Generates and stores a doc block for one entity.
// Shared by handleDocRequired and the caller-regeneration loop in handleEntityUpdated.
async function generateAndStore(payload: DocPayload): Promise<void> {
  // Fetch 1-hop callers to give LLM inbound context
  const callers = await fetchCallers(payload.workspaceId, payload.entityName);
  const callerNames = callers.map((c) => c.name);

  const docBlock = await generateDocBlock(payload, callerNames);
  await upsertDocBlock(payload, docBlock);

  logger.info({ entityId: payload.entityId, workspaceId: payload.workspaceId }, 'Doc block upserted');
}

// Handles DOC_REQUIRED — emitted by Ingestion for every new entity.
// Generates and stores a fresh doc block. Independent of any other entity.
async function handleDocRequired(payload: unknown): Promise<void> {
  const docPayload = payload as DocPayload;

  try {
    await generateAndStore(docPayload);
  } catch (err) {
    logger.error({ err, entityId: docPayload.entityId }, 'handleDocRequired failed');
    throw err;
  }
}

// Handles ENTITY_UPDATED — entity code or signature changed.
// Regenerates the entity's own doc block, then regenerates 1-hop callers
// whose docs may reference this entity's old behaviour.
async function handleEntityUpdated(payload: unknown): Promise<void> {
  const docPayload = payload as DocPayload;

  try {
    // Step 1 — regenerate this entity's own doc block
    await generateAndStore(docPayload);

    // Step 2 — fetch 1-hop callers and regenerate their doc blocks
    // Their docs may describe calling this entity — now potentially stale
    const callers = await fetchCallers(docPayload.workspaceId, docPayload.entityName);

    for (const caller of callers) {
      // Reconstruct a minimal DocPayload for the caller using what Graph Service returned.
      // commitHash is inherited from the triggering event — the graph state is at this commit.
      const callerPayload: DocPayload = {
        entityId:    caller.entityId,
        workspaceId: docPayload.workspaceId,
        repoId:      caller.repoId,
        filePath:    caller.filePath,
        entityName:  caller.name,
        kind:        caller.kind,
        language:    caller.language,
        code:        caller.code,
        callList:    [],   // caller's full call list not available here — doc will still be valid
        commitHash:  docPayload.commitHash,
      };

      try {
        await generateAndStore(callerPayload);
        logger.info({ entityId: caller.entityId }, 'Caller doc block regenerated');
      } catch (callerErr) {
        // Caller regeneration failure is non-fatal — log and continue to next caller
        logger.warn({ callerErr, entityId: caller.entityId }, 'Failed to regenerate caller doc block — continuing');
      }
    }
  } catch (err) {
    logger.error({ err, entityId: docPayload.entityId }, 'handleEntityUpdated failed');
    throw err;
  }
}

// Handles ENTITY_DELETED — removes the doc block for this entity.
// Caller doc blocks are NOT deleted — they remain valid until those callers
// are themselves updated or deleted via their own events.
async function handleEntityDeleted(payload: unknown): Promise<void> {
  const { entityId, workspaceId } = payload as DeletePayload;

  try {
    await DocBlockModel.deleteOne({ entityId, workspaceId });
    logger.info({ entityId, workspaceId }, 'Doc block deleted');
  } catch (err) {
    logger.error({ err, entityId, workspaceId }, 'handleEntityDeleted failed');
    throw err;
  }
}

export { handleDocRequired, handleEntityUpdated, handleEntityDeleted };