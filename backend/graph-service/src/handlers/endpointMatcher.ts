import { runQuery } from '../db/client';
import { logger } from '../logger';

/**
 * Endpoint matcher — connects matching endpoints within a workspace.
 * 
 * When an Endpoint entity is created, this checks if a matching endpoint
 * exists elsewhere in the workspace and creates an API_CALL edge.
 * 
 * Matching logic:
 *   Frontend: "POST https://example.com/public/login"  
 *   Backend:  "POST /login"
 *   → Match on same HTTP method + backend path is a suffix of the frontend URL path
 * 
 * Also handles backend→backend matching (e.g., microservice-to-microservice calls).
 * Direction: (caller endpoint) -[:API_CALL]-> (target endpoint)
 */

// Parses an endpoint name into method + path
// e.g. "POST https://example.com/public/login" → { method: "POST", path: "/public/login" }
// e.g. "POST /login" → { method: "POST", path: "/login" }
function parseEndpointName(name: string): { method: string; path: string; isFullUrl: boolean } | null {
    const parts = name.split(' ');
    if (parts.length < 2) return null;

    const method = parts[0].toUpperCase();
    let rawPath = parts.slice(1).join(' ');

    // Check if it's a full URL
    const isFullUrl = rawPath.startsWith('http://') || rawPath.startsWith('https://');

    if (isFullUrl) {
        try {
            const url = new URL(rawPath);
            rawPath = url.pathname;
        } catch {
            // If URL parsing fails, try to extract path manually
            const pathMatch = rawPath.match(/https?:\/\/[^/]+(\/.*)/);
            rawPath = pathMatch ? pathMatch[1] : rawPath;
        }
    }

    return { method, path: rawPath, isFullUrl };
}

// Checks if two paths match using suffix matching
// "/public/login" matches "/login" (backend path is suffix of full path)
// "/events/getAllEvents" matches "/getAllEvents"
function pathsMatch(callerPath: string, targetPath: string): boolean {
    // Exact match
    if (callerPath === targetPath) return true;

    // Caller path ends with target path
    // e.g. "/public/login" ends with "/login"
    if (callerPath.endsWith(targetPath)) return true;

    // Target path ends with caller path (reverse direction)
    if (targetPath.endsWith(callerPath)) return true;

    return false;
}

/**
 * After an Endpoint entity is created, try to match it with other endpoints
 * in the same workspace and create API_CALL edges.
 */
async function matchEndpoints(payload: any): Promise<void> {
    const { entityId, entityName, workspaceId, commitHash, kind } = payload;

    // Only process endpoint entities
    if (kind !== 'endpoint') return;

    const parsed = parseEndpointName(entityName);
    if (!parsed) return;

    const { method, path: endpointPath, isFullUrl } = parsed;

    // Find ALL other endpoints in this workspace with the same HTTP method
    const records = await runQuery(
        `MATCH (e:Endpoint {workspaceId: $workspaceId})
     WHERE e.validTo IS NULL
       AND e.entityId <> $entityId
       AND e.name STARTS WITH $method
     RETURN e.entityId AS entityId, e.name AS name`,
        { workspaceId, entityId, method: method + ' ' }
    );

    for (const record of records) {
        const otherEntityId = record.get('entityId');
        const otherName = record.get('name');
        const otherParsed = parseEndpointName(otherName);
        if (!otherParsed) continue;

        // Check if paths match
        if (!pathsMatch(endpointPath, otherParsed.path)) continue;

        // Determine direction: full-URL endpoints call path-only endpoints
        // If both are full URLs or both are paths, use creation order (the new one calls the existing one)
        let callerEntityId: string;
        let calleeEntityId: string;

        if (isFullUrl && !otherParsed.isFullUrl) {
            // Frontend (full URL) → Backend (path only)
            callerEntityId = entityId;
            calleeEntityId = otherEntityId;
        } else if (!isFullUrl && otherParsed.isFullUrl) {
            // Backend (path only) ← Frontend (full URL)
            callerEntityId = otherEntityId;
            calleeEntityId = entityId;
        } else {
            // Both same type — the new one references the existing one
            callerEntityId = entityId;
            calleeEntityId = otherEntityId;
        }

        // Create API_CALL edge (idempotent via MERGE)
        await runQuery(
            `MATCH (caller:Endpoint {entityId: $callerEntityId})
       WHERE caller.validTo IS NULL
       MATCH (callee:Endpoint {entityId: $calleeEntityId})
       WHERE callee.validTo IS NULL
       MERGE (caller)-[r:API_CALL {workspaceId: $workspaceId}]->(callee)
       ON CREATE SET r.validFrom = $commitHash, r.validTo = null`,
            { callerEntityId, calleeEntityId, workspaceId, commitHash }
        );

        logger.info(
            { caller: isFullUrl ? entityName : otherName, callee: isFullUrl ? otherName : entityName },
            'API_CALL edge created'
        );
    }
}

export { matchEndpoints };
