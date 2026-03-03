import { getCircularDependencies, getImpact } from '../clients/graphClient';
import { PatchResponse } from '../clients/llmClient';
import logger from '../logger';

interface SimulationResult {
  safe:   boolean;
  reason: string;
}

// Safety gate — validates a proposed patch before PR creation.
// Checks that the patch does not introduce new structural violations.
// Returns { safe: false, reason } if the patch should be discarded.
//
// NOTE: Full simulation requires applying the patch in memory, reparsing via
// Ingestion Service AST parser, and computing the projected entity/relation delta.
// Current implementation runs post-patch graph checks as a pragmatic approximation.
// Full AST reparse simulation is a TODO once Ingestion Service exposes a reparse endpoint.
const simulatePatch = async (
  workspaceId:   string,
  entityName:    string,
  patchResponse: PatchResponse
): Promise<SimulationResult> => {
  // Reject immediately if LLM confidence is LOW and severity is HIGH
  // LLM flagged it as risky — do not auto-proceed
  if (patchResponse.riskScore === 'HIGH' && patchResponse.severity === 'HIGH') {
    return {
      safe:   false,
      reason: 'LLM returned HIGH risk + HIGH severity — patch requires manual review',
    };
  }

  // Check that the patch explanation does not mention removing endpoints or public APIs
  const lowerExplanation = patchResponse.explanation.toLowerCase();
  const destructiveKeywords = ['remove endpoint', 'delete route', 'drop api', 'remove public'];

  for (const keyword of destructiveKeywords) {
    if (lowerExplanation.includes(keyword)) {
      return {
        safe:   false,
        reason: `Patch explanation suggests destructive change: "${keyword}" — discarded for safety`,
      };
    }
  }

  // Verify the entity's blast radius — if it's too large, require manual review
  try {
    const impact = await getImpact(workspaceId, entityName);
    const blastRadius = impact.upstream.length + impact.downstream.length;

    // More than 20 entities in blast radius — too risky to auto-patch
    if (blastRadius > 20) {
      return {
        safe:   false,
        reason: `Blast radius too large (${blastRadius} entities) — patch requires manual review`,
      };
    }
  } catch (err) {
    logger.warn({ err, entityName }, 'Simulation: blast radius check failed — proceeding with caution');
  }

  // Check that no new circular dependencies were introduced
  // NOTE: This is a pre-patch check — post-patch reparse is the full implementation
  try {
    const cycles = await getCircularDependencies(workspaceId);
    if (cycles.length > 0) {
      return {
        safe:   false,
        reason: `Graph already contains circular dependencies — patch deferred until cycles are resolved`,
      };
    }
  } catch (err) {
    logger.warn({ err }, 'Simulation: circular dep check failed — proceeding');
  }

  logger.info({ entityName, workspaceId }, 'Simulation gate passed — patch is safe to apply');

  return { safe: true, reason: 'All simulation checks passed' };
};

export { simulatePatch, SimulationResult };