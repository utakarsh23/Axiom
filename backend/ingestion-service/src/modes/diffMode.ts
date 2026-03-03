import { getInstallationClient, fetchCommitDiff, fetchFileContent } from '../github/client';
import { parseFile } from '../parser/index';
import { extract } from '../extractor/index';
import { computeFileHashes } from '../hasher/index';
import { computeDiff, makeEntityId } from '../diff/index';
import { publishEvents } from '../events/index';
import { EntityHashModel } from '../model/entityHash.model';
import { EntityHashes } from '../hasher/index';
import { logger } from '../logger';

// Reuse the same skip logic as Full Mode
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

const MAX_FILE_SIZE_BYTES = 1024 * 1024;

function shouldSkipFile(filePath: string): boolean {
  const parts = filePath.split('/');
  if (parts.some(p => SKIP_PATHS.has(p))) return true;
  // Guard against files with no extension (e.g. Makefile, Dockerfile)
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = filePath.slice(dotIndex).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

export interface DiffModeInput {
  workspaceId: string;
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  commitSha: string;
}

async function runDiffMode(input: DiffModeInput): Promise<void> {
  const { workspaceId, repoId, installationId, owner, repo, commitSha } = input;

  logger.info({ owner, repo, commitSha }, 'Processing commit');

  const octokit = await getInstallationClient(installationId);

  // Fetch only the files changed in this commit
  const changedFiles = await fetchCommitDiff(octokit, owner, repo, commitSha);

  let processed = 0;
  let skipped = 0;

  for (const file of changedFiles) {
    if (!file.filename) continue;
    if (shouldSkipFile(file.filename)) { skipped++; continue; }

    try {
      // If file was deleted — mark all its entities as deleted via empty extraction
      if (file.status === 'removed') {
        await handleDeletedFile(file.filename, repoId, workspaceId, commitSha);
        processed++;
        continue;
      }

      // Fetch current file content at this commit
      const content = await fetchFileContent(octokit, owner, repo, file.filename, commitSha);

      if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE_BYTES) {
        logger.info({ filename: file.filename }, 'Skipping large file');
        skipped++;
        continue;
      }

      // Parse → extract → hash
      const parsed = await parseFile(file.filename, content);
      if (!parsed) { skipped++; continue; }

      const { entities, calls } = extract(parsed);

      const newHashes = computeFileHashes(entities, calls);

      // Fetch old hashes + call lists from MongoDB
      const oldDocs = await EntityHashModel.find({ repoId, filePath: file.filename });

      const oldHashes = new Map<string, EntityHashes>();
      const oldCallLists = new Map<string, string[]>();

      for (const doc of oldDocs) {
        oldHashes.set(doc.entityName, {
          signatureHash: doc.signatureHash,
          bodyHash: doc.bodyHash,
          callListHash: doc.callListHash,
        });
        oldCallLists.set(doc.entityName, doc.callList);
      }

      // Diff new vs old — produces precise delta events
      const { events } = computeDiff(
        file.filename, repoId, workspaceId, commitSha,
        entities, calls,
        newHashes, oldHashes, oldCallLists,
      );

      publishEvents(events);

      // Upsert new hashes to MongoDB — replaces old state
      for (const entity of entities) {
        const hashes = newHashes.get(entity.name);
        if (!hashes) continue;

        const callList = calls
          .filter(c => c.callerName === entity.name)
          .map(c => c.calleeName);

        await EntityHashModel.findOneAndUpdate(
          { repoId, filePath: file.filename, entityName: entity.name },
          {
            workspaceId, repoId,
            filePath: file.filename,
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

      // Delete MongoDB records for entities that no longer exist in this file
      const newEntityNames = new Set(entities.map(e => e.name));
      for (const [oldName] of oldHashes) {
        if (!newEntityNames.has(oldName)) {
          await EntityHashModel.deleteOne({ repoId, filePath: file.filename, entityName: oldName });
        }
      }

      processed++;
    } catch (error: any) {
      logger.error({ filePath: file.filename, err: { message: error?.message, stack: error?.stack } }, 'Failed to process file');
    }
  }

  logger.info({ processed, skipped }, 'DiffMode done');
}

// Handles a file that was fully deleted in this commit
// Fetches all stored entities for that file and emits ENTITY_DELETED for each
async function handleDeletedFile(
  filePath: string,
  repoId: string,
  workspaceId: string,
  commitSha: string,
): Promise<void> {
  const oldDocs = await EntityHashModel.find({ repoId, filePath });

  for (const doc of oldDocs) {
    const entityId = makeEntityId(workspaceId, repoId, filePath, doc.entityName);
    publishEvents([
      {
        type: 'ENTITY_DELETED',
        payload: { entityId, entityName: doc.entityName, filePath, repoId, workspaceId, commitHash: commitSha },
      },
      ...doc.callList.map(callee => ({
        type: 'RELATION_REMOVED' as const,
        payload: { callerName: doc.entityName, calleeName: callee, filePath, repoId, workspaceId },
      })),
    ]);
  }

  // Remove all stored hashes for this file
  await EntityHashModel.deleteMany({ repoId, filePath });
}

export { runDiffMode };