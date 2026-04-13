import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

// Shape of a node returned by Graph Service
interface GraphNode {
  entityId: string;
  name: string;
  kind: string;
  filePath: string;
  language: string;
}

// Shape of the neighbourhood response — callers and callees of an entity
interface EntityNeighbourhood {
  upstream: GraphNode[];    // entities that call this entity
  downstream: GraphNode[];  // entities this entity calls
}

// Fetches the immediate neighbourhood (1-hop callers + callees) of an entity.
// Used to enrich search results with structural context.
const getEntityNeighbourhood = async (
  workspaceId: string,
  entityName: string
): Promise<EntityNeighbourhood> => {
  try {
    const response = await axios.get<EntityNeighbourhood>(
      `${config.graphService.url}/graph/${workspaceId}/impact/${encodeURIComponent(entityName)}`
    );
    return response.data;
  } catch (err) {
    // Non-fatal — return empty neighbourhood if Graph Service is unavailable
    logger.warn({ err, workspaceId, entityName }, 'Graph Service neighbourhood fetch failed — returning empty');
    return { upstream: [], downstream: [] };
  }
};

export { getEntityNeighbourhood, GraphNode, EntityNeighbourhood };