import { connect, NatsConnection, StringCodec } from 'nats';
import { config } from '../config';
import { logger } from '../logger';
import { handleDocRequired, handleEntityUpdated, handleEntityDeleted } from '../handlers/doc';

let nc: NatsConnection;
const sc = StringCodec();

// Generic helper — subscribes to a NATS subject and routes each message
// to the provided handler. Parses payload as JSON before passing it on.
// Logs and discards malformed messages rather than crashing the subscriber.
async function subscribeToSubject(
  subject: string,
  handler: (payload: unknown) => Promise<void>
): Promise<void> {
  const sub = nc.subscribe(subject);
  logger.info({ subject }, 'Subscribed to NATS subject');

  (async () => {
    for await (const msg of sub) {
      try {
        const payload = JSON.parse(sc.decode(msg.data));
        await handler(payload);
      } catch (err) {
        logger.error({ err, subject }, 'Failed to process NATS message');
      }
    }
  })();
}

// Connect to NATS and start all subscriptions.
// Must be called after connectDB() so handlers can safely write to MongoDB.
async function startSubscribers(): Promise<void> {
  try {
    nc = await connect({ servers: config.nats.url });
    logger.info({ url: config.nats.url }, 'Connected to NATS');

    // DOC_REQUIRED — new entity, generate + store its doc block
    await subscribeToSubject('DOC_REQUIRED', handleDocRequired);

    // ENTITY_UPDATED — entity changed, regenerate its doc block + 1-hop callers
    await subscribeToSubject('ENTITY_UPDATED', handleEntityUpdated);

    // ENTITY_DELETED — entity removed, delete its doc block
    await subscribeToSubject('ENTITY_DELETED', handleEntityDeleted);
  } catch (err) {
    logger.error({ err }, 'Failed to start NATS subscribers');
    throw err;
  }
}

export { startSubscribers };