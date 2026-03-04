import { connect, NatsConnection, StringCodec, Subscription } from 'nats';
import { config } from '../config';
import { logger } from '../logger';
import { handleEntityCreated, handleEntityUpdated, handleEntityDeleted } from '../handlers/entity';
import { handleRelationAdded, handleRelationRemoved } from '../handlers/relation';
import { matchEndpoints } from '../handlers/endpointMatcher';

const sc = StringCodec();
let nc: NatsConnection | null = null;
const subscriptions: Subscription[] = [];

// Wrapper: after creating the entity, try to match endpoints
async function handleEntityCreatedWithMatching(payload: any): Promise<void> {
  await handleEntityCreated(payload);
  // For endpoint entities, try to find matching endpoints in the workspace
  if (payload.kind === 'endpoint') {
    await matchEndpoints(payload);
  }
}

async function startSubscribers(): Promise<void> {
  nc = await connect({ servers: config.nats.url });
  logger.info({ url: config.nats.url }, 'Graph Service NATS connected');

  subscribeToSubject('ENTITY_CREATED', handleEntityCreatedWithMatching);
  subscribeToSubject('ENTITY_UPDATED', handleEntityUpdated);
  subscribeToSubject('ENTITY_DELETED', handleEntityDeleted);
  subscribeToSubject('RELATION_ADDED', handleRelationAdded);
  subscribeToSubject('RELATION_REMOVED', handleRelationRemoved);
}

async function stopSubscribers(): Promise<void> {
  for (const sub of subscriptions) {
    sub.unsubscribe();
  }
  try {
    await nc?.drain();
  } catch (_) {
    // NATS may already be closed on process exit — not an error
  }
}

// Generic subscribe helper — all subjects follow the same pattern:
// decode message → parse JSON → call handler → log errors without crashing
function subscribeToSubject(
  subject: string,
  handler: (payload: any) => Promise<void>
): void {
  if (!nc) return;

  const sub = nc.subscribe(subject);
  subscriptions.push(sub);

  (async () => {
    for await (const msg of sub) {
      try {
        const payload = JSON.parse(sc.decode(msg.data));
        await handler(payload);
      } catch (error: any) {
        logger.error({ subject, error }, `Failed to handle ${subject}`);
      }
    }
  })();
}

export { startSubscribers, stopSubscribers };