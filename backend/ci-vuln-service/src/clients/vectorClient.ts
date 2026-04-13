import axios from 'axios';
import { config } from '../config';
import logger from '../logger';

interface EntityCodeResult {
    entityId: string;
    code: string;
    metadata: Record<string, string>;
}

// Fetches raw code for specific entities by their IDs from Vector Service.
// Used to retrieve caller/callee code for LLM context assembly.
const fetchEntityCode = async (workspaceId: string, entityIds: string[]): Promise<EntityCodeResult[]> => {
    try {
        const response = await axios.post<{ results: EntityCodeResult[] }>(
            `${config.services.vector}/vector/entities`,
            { workspaceId, entityIds }
        );
        return response.data.results;
    } catch (err) {
        logger.error({ err, workspaceId }, 'Vector Service entity fetch failed');
        throw err;
    }
};

export { fetchEntityCode, EntityCodeResult };
