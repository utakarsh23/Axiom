import { getImpact, GraphNode } from '../clients/graphClient';
import { Finding } from '../types/finding';
import { EntityEventPayload } from '../nats/subscriber';
import { PatchRequest } from '../clients/llmClient';
import { fetchEntityCode } from '../clients/vectorClient';
import logger from '../logger';

// Assembled context sent to LLM Service at Tier 3.
// Contains everything LLM needs — never the entire graph.
interface AssembledContext extends PatchRequest {
  entityName: string;
  filePath: string;
}


// Max number of caller/callee function bodies to include in LLM context.
// Keeps token count bounded while providing enough usage patterns.
const MAX_DEPENDENT_CODE = 3;

// Assembles structured input for LLM Service from findings + entity data + graph impact.
// Called only after Tier 1 or Tier 2 produced at least one finding.
const assembleContext = async (
  payload: EntityEventPayload,
  findings: Finding[]
): Promise<AssembledContext> => {
  let callers: GraphNode[] = [];
  let callees: GraphNode[] = [];

  // Fetch blast radius from Graph Service for structural context
  try {
    const impact = await getImpact(payload.workspaceId, payload.entityName);
    callers = impact.upstream;
    callees = impact.downstream;
  } catch (err) {
    // Non-fatal — LLM can still work with findings + entity code alone
    logger.warn({ err, entityId: payload.entityId }, 'Impact fetch failed — proceeding without callers/callees');
  }
  // Fetch raw code for the top N callers + callees from Vector Service (ChromaDB)
  // This gives the LLM actual function bodies instead of just names
  const dependentIds = [
    ...callers.slice(0, MAX_DEPENDENT_CODE).map(c => c.entityId),
    ...callees.slice(0, MAX_DEPENDENT_CODE).map(c => c.entityId),
  ];
  let dependentCode: Record<string, string> = {};
  if (dependentIds.length > 0) {
    try {
      const entities = await fetchEntityCode(payload.workspaceId, dependentIds);
      dependentCode = Object.fromEntries(entities.map(e => [e.entityId, e.code]));
    } catch (err) {
      logger.warn({ err, entityId: payload.entityId }, 'Dependent code fetch failed — proceeding with names only');
    }
  }
  // Enrich caller/callee nodes with their actual code (if fetched)
  const enrichedCallers = callers.map(c => ({ ...c, code: dependentCode[c.entityId] ?? '' }));
  const enrichedCallees = callees.map(c => ({ ...c, code: dependentCode[c.entityId] ?? '' }));
  logger.info(
    { entityId: payload.entityId, findings: findings.length, callers: callers.length, callees: callees.length, codeAttached: Object.keys(dependentCode).length },
    'Context assembled for Tier 3'
  );

  return {
    entityName: payload.entityName,
    filePath: payload.filePath,
    findings,
    entityCode: payload.code,
    callers: enrichedCallers,
    callees: enrichedCallees,
    similarSafePatterns: [],
  };
};

export { assembleContext, AssembledContext };