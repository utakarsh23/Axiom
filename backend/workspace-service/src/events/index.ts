import { connect, NatsConnection, StringCodec } from 'nats';
import { config } from '../config';
import logger from '../logger';

// NATS connection — initialized once at service startup
// All event emissions from workspace-service use this single connection
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

// Publishes to a NATS subject with a plain object payload.
// Used for trigger events like REPO_ADDED.
function publishRaw(subject: string, payload: object): void {
    if (!nc) throw new Error('NATS not connected. Call connectNats() first.');
    nc.publish(subject, sc.encode(JSON.stringify(payload)));
}

export { connectNats, disconnectNats, publishRaw };
