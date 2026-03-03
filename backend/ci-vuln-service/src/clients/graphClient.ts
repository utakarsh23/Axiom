import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

// Blast radius returned by Graph Service impact traversal
interface ImpactResult {
  upstream:   GraphNode[];   // entities that call the target
  downstream: GraphNode[];   // entities the target calls
  endpoints:  GraphNode[];   // HTTP endpoints in the blast radius
}

interface GraphNode {
  entityId:  string;
  name:      string;
  kind:      string;
  filePath:  string;
  language:  string;
}

// Checks whether the workspace graph contains any circular dependencies.
// Returns the cycle paths found — empty array means clean.
const getCircularDependencies = async (workspaceId: string): Promise<string[][]> => {
  try {
    const response = await axios.get<{ cycles: string[][] }>(
      `${config.services.graph}/graph/${workspaceId}/cycles`
    );
    return response.data.cycles ?? [];
  } catch (err) {
    logger.error({ err, workspaceId }, 'Graph Service cycle check failed');
    throw err;
  }
};

// Returns the blast radius for a named entity — callers, callees, impacted endpoints.
// Used by Tier 3 context assembly and by the patch simulation gate.
const getImpact = async (workspaceId: string, entityName: string): Promise<ImpactResult> => {
  try {
    const response = await axios.get<ImpactResult>(
      `${config.services.graph}/graph/${workspaceId}/impact/${entityName}`
    );
    return response.data;
  } catch (err) {
    logger.warn({ err, workspaceId, entityName }, 'Graph Service impact fetch failed — returning empty');
    return { upstream: [], downstream: [], endpoints: [] };
  }
};

// Fetches deprecated entities that still have active incoming CALLS edges.
// Any result here is a Tier 1 violation.
const getDeprecatedStillCalled = async (workspaceId: string): Promise<GraphNode[]> => {
  try {
    const response = await axios.get<{ entities: GraphNode[] }>(
      `${config.services.graph}/graph/${workspaceId}/deprecated-called`
    );
    return response.data.entities ?? [];
  } catch (err) {
    logger.error({ err, workspaceId }, 'Graph Service deprecated check failed');
    throw err;
  }
};

// Fetches removed entities (validTo set) that are still referenced by CALLS edges.
// Indicates a caller was not updated after the callee was removed.
const getRemovedButReferenced = async (workspaceId: string): Promise<GraphNode[]> => {
  try {
    const response = await axios.get<{ entities: GraphNode[] }>(
      `${config.services.graph}/graph/${workspaceId}/removed-referenced`
    );
    return response.data.entities ?? [];
  } catch (err) {
    logger.error({ err, workspaceId }, 'Graph Service removed-referenced check failed');
    throw err;
  }
};

export {
  getCircularDependencies,
  getImpact,
  getDeprecatedStillCalled,
  getRemovedButReferenced,
  ImpactResult,
  GraphNode,
};