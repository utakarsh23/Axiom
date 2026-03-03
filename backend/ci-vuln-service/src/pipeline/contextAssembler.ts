import { getImpact, GraphNode } from '../clients/graphClient';
import { Finding } from '../types/finding';
import { EntityEventPayload } from '../nats/subscriber';
import { PatchRequest } from '../clients/llmClient';
import logger from '../logger';

// Assembled context sent to LLM Service at Tier 3.
// Contains everything LLM needs — never the entire graph.
interface AssembledContext extends PatchRequest {
  entityName: string;
  filePath:   string;
}

// Assembles structured input for LLM Service from findings + entity data + graph impact.
// Called only after Tier 1 or Tier 2 produced at least one finding.
const assembleContext = async (
  payload:  EntityEventPayload,
  findings: Finding[]
): Promise<AssembledContext> => {
  let callers:   GraphNode[] = [];
  let callees:   GraphNode[] = [];

  // Fetch blast radius from Graph Service for structural context
  try {
    const impact = await getImpact(payload.workspaceId, payload.entityName);
    callers = impact.upstream;
    callees = impact.downstream;
  } catch (err) {
    // Non-fatal — LLM can still work with findings + entity code alone
    logger.warn({ err, entityId: payload.entityId }, 'Impact fetch failed — proceeding without callers/callees');
  }

  logger.info(
    { entityId: payload.entityId, findings: findings.length, callers: callers.length, callees: callees.length },
    'Context assembled for Tier 3'
  );

  return {
    entityName:          payload.entityName,
    filePath:            payload.filePath,
    findings,
    entityCode:          payload.code,
    callers,
    callees,
    // Similar safe patterns from Vector Service — placeholder for now
    // TODO: call Vector Service POST /vector/query with entityCode to get top-K similar entities
    similarSafePatterns: [],
  };
};

export { assembleContext, AssembledContext };