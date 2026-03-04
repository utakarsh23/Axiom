import { getInstallationClient, fetchRepoTree, fetchFileContent, fetchLatestCommitSha } from "../github/client";
import { parseFile } from "../parser";
import { extract } from '../extractor/index';
import { computeFileHashes } from '../hasher/index';
import { computeDiff } from '../diff/index';
import { publishEvents } from '../events/index';
import { EntityHashModel } from '../model/entityHash.model';
import { RepoRegistryModel } from '../model/repoRegistry.model';
import { logger } from '../logger';


const SKIP_EXTENSIONS = new Set([
  '.lock', '.json', '.yaml', '.yml', '.toml', '.env',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.wasm', '.map', '.min.js', '.min.css',
  '.csv', '.sql', '.md', '.txt', '.pdf',
]);

const SKIP_PATHS = new Set([
  'node_modules', 'vendor', 'dist', 'build', '.git',
  '__pycache__', '.next', 'coverage',
]);

// 1024KB — files above this are skipped (generated/minified files)
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

function shouldSkipFile(filePath: string): boolean {
  // Skip if any path segment is in the skip list
  const parts = filePath.split('/');
  if (parts.some(p => SKIP_PATHS.has(p))) return true;

  // Skip by extension — guard against files with no extension (e.g. Makefile, Dockerfile)
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = filePath.slice(dotIndex).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) return true;
  }

  return false;
}


export interface FullModeInput {
  workspaceId: string;
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;          // default branch — used to resolve commitSha if not provided
  commitSha?: string;      // optional — if absent, resolved from GitHub HEAD of branch
  gitUrl?: string;         // optional — constructed from owner+repo if not provided
}

async function runFullMode(input: FullModeInput): Promise<void> {
  const { workspaceId, repoId, installationId, owner, repo, branch } = input;
  const gitUrl = input.gitUrl ?? `https://github.com/${owner}/${repo}`;

  const octokit = await getInstallationClient(installationId);

  // Resolve commitSha if not provided — fetch latest HEAD of the default branch
  const commitSha = input.commitSha ?? await fetchLatestCommitSha(octokit, owner, repo, branch);

  logger.info({ owner, repo, commitSha }, 'Starting cold start ingestion');


  // Fetch entire repo file tree at this commit
  const tree = await fetchRepoTree(octokit, owner, repo, commitSha);

  let processed = 0;
  let skipped = 0;

  for (const file of tree) {
    if (!file.path) continue;
    if (shouldSkipFile(file.path)) { skipped++; continue; }

    try {
      // Fetch raw file content
      const content = await fetchFileContent(octokit, owner, repo, file.path, commitSha);

      // Skip files above size threshold
      if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE_BYTES) {
        logger.info({ filePath: file.path }, 'Skipping large file');
        skipped++;
        continue;
      }

      // Parse → extract → hash
      const parsed = await parseFile(file.path, content);
      if (!parsed) { skipped++; continue; }

      const { entities, calls } = extract(parsed);
      if (entities.length === 0) continue;

      const newHashes = computeFileHashes(entities, calls);

      // Cold start — no previous state exists
      const oldHashes = new Map();
      const oldCallLists = new Map();

      // Diff — everything will be ENTITY_CREATED
      const { events } = computeDiff(
        file.path, repoId, workspaceId, commitSha,
        entities, calls,
        newHashes, oldHashes, oldCallLists,
        gitUrl, branch,
      );

      // Publish events to NATS
      publishEvents(events);

      // Save hashes + call lists to MongoDB
      for (const entity of entities) {
        const hashes = newHashes.get(entity.name);
        if (!hashes) continue;

        const callList = calls
          .filter(c => c.callerName === entity.name)
          .map(c => c.calleeName);

        await EntityHashModel.findOneAndUpdate(
          { repoId, filePath: file.path, entityName: entity.name },
          {
            workspaceId, repoId,
            filePath: file.path,
            entityName: entity.name,
            kind: entity.kind,
            language: entity.language,
            signatureHash: hashes.signatureHash,
            bodyHash: hashes.bodyHash,
            callListHash: hashes.callListHash,
            callList,
            commitHash: commitSha,
            updatedAt: new Date(),
          },
          { upsert: true, returnDocument: 'after' }
        );
      }

      processed++;
    } catch (error: any) {
      // Log and continue — one file failure should not abort the entire ingestion
      logger.error({ filePath: file.path, error }, 'Failed to process file');
    }
  }

  logger.info({ processed, skipped }, 'FullMode done');

  // Register (installationId, owner, repo) → (workspaceId, repoId) so the webhook
  // handler can resolve Axiom IDs when GitHub sends future push events for this repo.
  await RepoRegistryModel.findOneAndUpdate(
    { installationId, owner, repo },
    { workspaceId, repoId, defaultBranch: branch, updatedAt: new Date() },
    { upsert: true }
  );
  logger.info({ owner, repo, workspaceId, repoId }, 'RepoRegistry upserted');
}

export { runFullMode };


