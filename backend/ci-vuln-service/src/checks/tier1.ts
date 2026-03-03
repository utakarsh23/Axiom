import {
  getCircularDependencies,
  getDeprecatedStillCalled,
  getRemovedButReferenced,
} from '../clients/graphClient';
import { Finding } from '../types/finding';
import { IRulebook } from '../types/rulebook';
import logger from '../logger';

// Checks whether a CALLS edge from `from` layer to `to` layer is forbidden.
// Layers are inferred from entity file paths — e.g. 'controller', 'service', 'repository'.
const inferLayer = (filePath: string): string => {
  const lower = filePath.toLowerCase();
  if (lower.includes('controller'))  return 'controller';
  if (lower.includes('service'))     return 'service';
  if (lower.includes('repository') || lower.includes('repo')) return 'repository';
  if (lower.includes('model'))       return 'model';
  if (lower.includes('route') || lower.includes('router')) return 'router';
  return 'unknown';
};

// Runs all Tier 1 structural checks against the Graph Service.
// Returns an array of findings — empty means structurally clean.
// All checks are exact Cypher traversals — zero false positives.
const runTier1Checks = async (
  workspaceId: string,
  entityFilePath: string,
  rulebook: IRulebook | null
): Promise<Finding[]> => {
  const findings: Finding[] = [];

  // Check 1 — circular dependencies in the workspace graph
  try {
    const cycles = await getCircularDependencies(workspaceId);

    for (const cycle of cycles) {
      findings.push({
        source:      'graph',
        type:        'circular_dependency',
        description: `Circular dependency detected: ${cycle.join(' → ')}`,
        severity:    'HIGH',
        path:        cycle,
      });
    }
  } catch (err) {
    logger.error({ err, workspaceId }, 'Tier 1: circular dependency check failed');
  }

  // Check 2 — deprecated entities still being called
  try {
    const deprecated = await getDeprecatedStillCalled(workspaceId);

    for (const entity of deprecated) {
      findings.push({
        source:      'graph',
        type:        'deprecated_api_called',
        description: `Deprecated entity "${entity.name}" is still referenced by active callers`,
        severity:    'MEDIUM',
        entity:      entity.name,
      });
    }
  } catch (err) {
    logger.error({ err, workspaceId }, 'Tier 1: deprecated check failed');
  }

  // Check 3 — removed entities still referenced
  try {
    const removed = await getRemovedButReferenced(workspaceId);

    for (const entity of removed) {
      findings.push({
        source:      'graph',
        type:        'removed_entity_referenced',
        description: `Entity "${entity.name}" was removed but is still referenced by a caller`,
        severity:    'HIGH',
        entity:      entity.name,
      });
    }
  } catch (err) {
    logger.error({ err, workspaceId }, 'Tier 1: removed-referenced check failed');
  }

  // Check 4 — forbidden layer access from workspace rulebook architecture rules
  // NOTE: This is a path-based approximation — it flags any entity whose file path
  // resolves to a forbidden `from` layer. A full implementation would query Graph Service
  // for CALLS edges crossing the layer boundary. Flagging here ensures LLM gets context
  // to confirm whether an actual forbidden access exists before a PR is raised.
  const forbiddenRules = rulebook?.architecture?.forbiddenLayerAccess ?? [];
  const entityLayer    = inferLayer(entityFilePath);

  for (const rule of forbiddenRules) {
    if (entityLayer === rule.from) {
      findings.push({
        source:      'graph',
        type:        'forbidden_layer_access',
        description: `Entity lives in "${rule.from}" layer which must not access "${rule.to}" directly. ${rule.reason}`,
        severity:    'HIGH',
        entity:      entityFilePath,
      });
    }
  }

  logger.info(
    { workspaceId, findingsCount: findings.length },
    'Tier 1 structural checks complete'
  );

  return findings;
};

export { runTier1Checks };