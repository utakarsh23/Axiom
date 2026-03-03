import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';
import { publishRaw } from '../events/index';
import { RepoRegistryModel } from '../model/repoRegistry.model';
import { logger } from '../logger';

// Verifies the HMAC-SHA256 signature GitHub sends on every webhook delivery.
// GitHub signs the raw request body with your webhook secret.
// We must compare against the raw body — never the parsed JSON.
function verifySignature(rawBody: Buffer, signatureHeader: string): boolean {
  const expected = `sha256=${createHmac('sha256', config.github.webhookSecret)
    .update(rawBody)
    .digest('hex')}`;

  const actual = signatureHeader;

  if (expected.length !== actual.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

const webhookRouter = Router();

// GitHub sends the raw body as a Buffer when express.raw() middleware is used.
// This must be mounted with express.raw({ type: 'application/json' }) — NOT express.json().
// Reason: express.json() parses the body before we can verify the signature against the raw bytes.
webhookRouter.post('/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const eventType = req.headers['x-github-event'] as string | undefined;

  if (!signature) {
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  if (!verifySignature(req.body as Buffer, signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Acknowledge immediately — GitHub expects a 2xx within a few seconds.
  // All actual processing happens async via NATS.
  res.status(200).json({ ok: true });

  if (eventType !== 'push') return;

  const payload = JSON.parse((req.body as Buffer).toString());

  const installationId: number = payload.installation?.id;
  const owner: string = payload.repository?.owner?.login;
  const repo: string = payload.repository?.name;
  const commitSha: string = payload.after;       // SHA of the head commit after the push
  const defaultBranch: string = payload.repository?.default_branch;
  const ref: string = payload.ref;         // e.g. "refs/heads/main"

  if (!installationId || !owner || !repo || !commitSha) {
    logger.warn({ owner, repo, installationId, commitSha }, 'Push event missing required fields — skipping');
    return;
  }

  // Only process pushes to the default branch.
  // Feature branch commits are ignored until they are merged.
  if (ref !== `refs/heads/${defaultBranch}`) {
    logger.info({ ref, defaultBranch }, 'Ignoring push to non-default branch');
    return;
  }

  try {
    // Look up workspaceId + repoId from the local registry populated during Full Mode.
    // If this repo hasn't completed cold start yet, skip — we have no Axiom IDs to use.
    const registry = await RepoRegistryModel.findOne({ installationId, owner, repo });
    if (!registry) {
      logger.warn({ owner, repo, installationId }, 'Repo not in registry — cold start not yet complete, skipping commit');
      return;
    }

    publishRaw('COMMIT_RECEIVED', {
      installationId,
      owner,
      repo,
      commitSha,
      workspaceId: registry.workspaceId,
      repoId: registry.repoId,
    });

    logger.info({ owner, repo, commitSha, workspaceId: registry.workspaceId, repoId: registry.repoId }, 'COMMIT_RECEIVED published');
  } catch (err: any) {
    logger.error({ err }, 'Failed to publish COMMIT_RECEIVED');
  }
});

export { webhookRouter };