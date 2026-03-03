import { connect, NatsConnection, StringCodec } from 'nats';
import { config } from '../config';
import { logger } from '../logger';
import { handleEmbeddingRequired, handleEntityUpdated, handleEntityDeleted } from '../handlers/embedding';

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
// Must be called after connectDB() so handlers can safely reach ChromaDB.
async function startSubscribers(): Promise<void> {
  try {
    nc = await connect({ servers: config.nats.url });
    logger.info({ url: config.nats.url }, 'Connected to NATS');

    await subscribeToSubject('EMBEDDING_REQUIRED', handleEmbeddingRequired);
    await subscribeToSubject('ENTITY_UPDATED', handleEntityUpdated);
    await subscribeToSubject('ENTITY_DELETED', handleEntityDeleted);
  } catch (err) {
    logger.error({ err }, 'Failed to start NATS subscribers');
    throw err;
  }
}

export { startSubscribers };