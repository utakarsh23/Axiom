import { connect, NatsConnection, StringCodec } from 'nats';
import { config } from '../config';
import { DiffEvent } from '../diff/index';
import { logger } from '../logger';

// NATS connection — initialized once at service startup
// All event emissions use this single connection
let nc: NatsConnection | null = null;
const sc = StringCodec();

async function connectNats(): Promise<void> {
  try {
    nc = await connect({ servers: config.nats.url });
    logger.info({ url: config.nats.url }, 'NATS connected');
  } catch (error: any) {
    logger.error({ error }, 'NATS connection failed');
    throw error;
  }
}

async function disconnectNats(): Promise<void> {
  await nc?.drain();
}

// Publishes a single DiffEvent to NATS
// Subject = event type e.g. "ENTITY_CREATED", "RELATION_ADDED"
// Payload is serialized to JSON string
function publishEvent(event: DiffEvent): void {
  if (!nc) throw new Error('NATS not connected. Call connectNats() first.');

  nc.publish(
    event.type,
    sc.encode(JSON.stringify(event.payload))
  );
}

// Publishes all events from a DiffResult in order
// Called by mode handlers after computeDiff returns
function publishEvents(events: DiffEvent[]): void {
  for (const event of events) {
    publishEvent(event);
  }
}

// Publishes to any arbitrary NATS subject with a plain object payload.
// Used for input/trigger events (e.g. COMMIT_RECEIVED, REPO_ADDED) that are
// not DiffEvent types and don't go through the diff pipeline.
function publishRaw(subject: string, payload: object): void {
  if (!nc) throw new Error('NATS not connected. Call connectNats() first.');
  nc.publish(subject, sc.encode(JSON.stringify(payload)));
}

export { connectNats, disconnectNats, publishEvent, publishEvents, publishRaw };