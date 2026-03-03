import { connect, NatsConnection, StringCodec, Subscription } from 'nats';
import { config } from '../config';
import { runFullMode } from '../modes/fullMode';
import { runDiffMode } from '../modes/diffMode';
import { logger } from '../logger';

const sc = StringCodec();
let nc: NatsConnection | null = null;
const subscriptions: Subscription[] = [];

async function startSubscribers(): Promise<void> {
  nc = await connect({ servers: config.nats.url });
  logger.info({ url: config.nats.url }, 'Subscriber NATS connected');

  subscribeToRepoAdded();
  subscribeToCommitReceived();
}

async function stopSubscribers(): Promise<void> {
  for (const sub of subscriptions) {
    sub.unsubscribe();
  }
  await nc?.drain();
}

// Listens for REPO_ADDED — triggers Full Mode (cold start ingestion)
// Payload expected: { workspaceId, repoId, installationId, owner, repo, commitSha }
function subscribeToRepoAdded(): void {
  if (!nc) return;

  const sub = nc.subscribe('REPO_ADDED');
  subscriptions.push(sub);

  (async () => {
    for await (const msg of sub) {
      try {
        const payload = JSON.parse(sc.decode(msg.data));
        logger.info({ owner: payload.owner, repo: payload.repo }, 'REPO_ADDED received');
        await runFullMode(payload);
      } catch (error: any) {
        logger.error({ error }, 'Failed to handle REPO_ADDED');
      }
    }
  })();
}

// Listens for COMMIT_RECEIVED — triggers Diff Mode (incremental ingestion)
// Payload expected: { workspaceId, repoId, installationId, owner, repo, commitSha }
function subscribeToCommitReceived(): void {
  if (!nc) return;

  const sub = nc.subscribe('COMMIT_RECEIVED');
  subscriptions.push(sub);

  (async () => {
    for await (const msg of sub) {
      try {
        const payload = JSON.parse(sc.decode(msg.data));
        logger.info({ owner: payload.owner, repo: payload.repo, commitSha: payload.commitSha }, 'COMMIT_RECEIVED');
        await runDiffMode(payload);
      } catch (error: any) {
        logger.error({ error }, 'Failed to handle COMMIT_RECEIVED');
      }
    }
  })();
}

export { startSubscribers, stopSubscribers };