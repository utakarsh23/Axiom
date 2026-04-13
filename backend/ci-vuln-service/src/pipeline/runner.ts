import { EntityEventPayload } from '../nats/subscriber';
import { getRulebook } from '../clients/workspaceClient';
import { requestPatch } from '../clients/llmClient';
import { runTier1Checks } from '../checks/tier1';
import { runTier2aChecks } from '../checks/tier2a';
import { runTier2bChecks } from '../checks/tier2b';
import { assembleContext } from './contextAssembler';
import { simulatePatch } from './simulation';
import { buildAndCreatePR, RepoInfo } from './prBuilder';
import { Finding } from '../types/finding';
import logger from '../logger';

// Derives repo owner and name from the git URL stored in the event payload.
// e.g. https://github.com/owner/repo.git → { owner: 'owner', repo: 'repo' }
const parseRepoInfo = (gitUrl: string, baseBranch = 'main'): RepoInfo => {
  const match = gitUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/);

  if (!match) {
    throw Object.assign(
      new Error(`Cannot parse owner/repo from git URL: ${gitUrl}`),
      { status: 400 }
    );
  }

  return { owner: match[1], repo: match[2], baseBranch };
};

// Main pipeline entry point — called for every ENTITY_CREATED and ENTITY_UPDATED event.
// Runs three-tier escalation: Tier 1 (graph) → Tier 2 (semgrep + rulebook) → gate → Tier 3 (LLM).
// Only escalates to LLM when Tier 1 or Tier 2 produces findings.
const runPipeline = async (payload: EntityEventPayload): Promise<void> => {
  const { workspaceId, entityId, entityName, entityType, filePath, code, language } = payload;

  logger.info({ entityId, workspaceId }, 'Pipeline started');

  // Fetch workspace rulebook once — used by Tier 1 (layer rules) and Tier 2b (naming, patterns)
  // Returns null if not defined — Tier 2b will be skipped
  const rulebook = await getRulebook(workspaceId);

  // ── Tier 1 — Structural checks (Graph Service) ──────────────────────────
  const tier1Findings = await runTier1Checks(workspaceId, filePath, rulebook);

  // ── Tier 2 — Code pattern + Rulebook checks (parallel) ──────────────────
  // 2a runs sync (Semgrep shell exec + npm audit) — put in Promise.all with 2b
  const [tier2aFindings, tier2bFindings] = await Promise.all([
    Promise.resolve(runTier2aChecks(code, language, process.cwd())),
    Promise.resolve(runTier2bChecks(entityName, entityType, code, rulebook)),
  ]);

  const allFindings: Finding[] = [
    ...tier1Findings,
    ...tier2aFindings,
    ...tier2bFindings,
  ];

  // ── Gate — stop here if nothing found ────────────────────────────────────
  if (allFindings.length === 0) {
    logger.info({ entityId, workspaceId }, 'Pipeline complete — no violations found. Clean commit.');
    return;
  }

  logger.info(
    { entityId, workspaceId, findingsCount: allFindings.length },
    'Findings detected — escalating to Tier 3 (LLM)'
  );

  // ── Tier 3 — LLM confirmation + patch generation ─────────────────────────
  const context = await assembleContext(payload, allFindings);
  const patch = await requestPatch(context);

  logger.info(
    { entityId, riskScore: patch.riskScore, severity: patch.severity },
    'LLM patch received'
  );

  // ── Simulation gate — validate patch safety before PR creation ────────────
  const simulation = await simulatePatch(workspaceId, entityName, patch);

  if (!simulation.safe) {
    logger.warn(
      { entityId, reason: simulation.reason },
      'Simulation gate failed — patch discarded'
    );
    return;
  }

  // ── PR creation ──────────────────────────────────────────────────────────
  const { gitUrl, baseBranch } = payload;

  if (!gitUrl) {
    logger.warn({ entityId }, 'gitUrl missing from event payload — cannot create PR. Skipping.');
    return;
  }

  let repoInfo: RepoInfo;

  try {
    repoInfo = parseRepoInfo(gitUrl, baseBranch);
  } catch (err) {
    logger.error({ err, entityId }, 'Failed to parse repo info from gitUrl — cannot create PR');
    return;
  }

  const pr = await buildAndCreatePR(repoInfo, entityName, allFindings, patch);

  logger.info(
    { entityId, prUrl: pr.prUrl, prNumber: pr.prNumber, riskScore: patch.riskScore },
    'Pipeline complete — PR created'
  );
};

export { runPipeline };