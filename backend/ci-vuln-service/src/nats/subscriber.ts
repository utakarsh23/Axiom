import { getNatsConnection, sc, subscriptions } from './client';
import { runPipeline } from '../pipeline/runner';
import logger from '../logger';

// Shape of the entity event payload emitted by Ingestion Service
// Both ENTITY_CREATED and ENTITY_UPDATED carry this structure
interface EntityEventPayload {
  workspaceId: string;
  repoId: string;
  entityId: string;
  entityName: string;
  entityType: string;   // 'Function' | 'Class' | 'Endpoint'
  filePath: string;
  code: string;   // raw source code of the entity
  commitHash: string;
  language: string;
  gitUrl: string;   // full GitHub clone URL — used by PR creation
  baseBranch: string;   // default branch of the repo — PR targets this branch
}

// Subscribes to ENTITY_CREATED — runs the full check pipeline on new entities
const subscribeToEntityCreated = (): void => {
  const nc = getNatsConnection();
  const sub = nc.subscribe('ENTITY_CREATED');
  subscriptions.push(sub);

  (async () => {
    for await (const msg of sub) {
      try {
        const payload = JSON.parse(sc.decode(msg.data)) as EntityEventPayload;
        logger.info({ entityId: payload.entityId, workspaceId: payload.workspaceId }, 'ENTITY_CREATED received');

        // Fire and forget — never block the subscriber loop
        runPipeline(payload).catch((err: any) => {
          logger.error({ err, entityId: payload.entityId }, 'Pipeline failed on ENTITY_CREATED');
        });
      } catch (err: any) {
        logger.error({ err }, 'Failed to parse ENTITY_CREATED payload — skipping');
      }
    }
  })();
};

// Subscribes to ENTITY_UPDATED — runs checks on changed entities
const subscribeToEntityUpdated = (): void => {
  const nc = getNatsConnection();
  const sub = nc.subscribe('ENTITY_UPDATED');
  subscriptions.push(sub);

  (async () => {
    for await (const msg of sub) {
      try {
        const payload = JSON.parse(sc.decode(msg.data)) as EntityEventPayload;
        logger.info({ entityId: payload.entityId, workspaceId: payload.workspaceId }, 'ENTITY_UPDATED received');

        runPipeline(payload).catch((err: any) => {
          logger.error({ err, entityId: payload.entityId }, 'Pipeline failed on ENTITY_UPDATED');
        });
      } catch (err: any) {
        logger.error({ err }, 'Failed to parse ENTITY_UPDATED payload — skipping');
      }
    }
  })();
};

// Registers all NATS subscribers — called once at startup after connectNats()
const registerSubscribers = (): void => {
  subscribeToEntityCreated();
  subscribeToEntityUpdated();
  logger.info('CI/Vuln NATS subscribers registered');
};

export { registerSubscribers, EntityEventPayload };