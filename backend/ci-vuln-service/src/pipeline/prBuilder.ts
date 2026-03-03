import { createPullRequest, CreatePRResult } from '../clients/githubClient';
import { PatchResponse } from '../clients/llmClient';
import { Finding } from '../types/finding';
import logger from '../logger';

// Repo info needed to create a PR — sourced from the event payload + workspace config
interface RepoInfo {
  owner:      string;
  repo:       string;
  baseBranch: string;
}

// Formats the PR body from violation findings + LLM patch response.
// Gives reviewers full context: what was found, why, what the fix does, risk level.
const buildPrBody = (findings: Finding[], patch: PatchResponse): string => {
  const findingLines = findings
    .map((f) => `- **[${f.source.toUpperCase()}]** ${f.description}`)
    .join('\n');

  return [
    '## Axiom — Automated Violation Fix',
    '',
    '### Violations Found',
    findingLines,
    '',
    '### Proposed Fix',
    patch.explanation,
    '',
    '### Patch',
    '```diff',
    patch.unifiedDiff,
    '```',
    '',
    '### Risk Assessment',
    `- **Risk Level:** ${patch.riskScore}`,
    `- **Severity:** ${patch.severity}`,
    '',
    '> This PR was generated automatically by Axiom CI/Vuln Service.',
    '> All structural impact has been validated before this PR was opened.',
    '> Merge decision is governed by workspace risk policy.',
  ].join('\n');
};

// Creates a sanitized branch name from entity name + timestamp.
// e.g. axiom/fix-getUserById-1709481234567
const buildBranchName = (entityName: string): string => {
  const sanitized = entityName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  return `axiom/fix-${sanitized}-${Date.now()}`;
};

// Builds and opens the PR for a validated patch.
// Only called after simulation gate passes.
const buildAndCreatePR = async (
  repoInfo:   RepoInfo,
  entityName: string,
  findings:   Finding[],
  patch:      PatchResponse
): Promise<CreatePRResult> => {
  const branchName = buildBranchName(entityName);
  const prTitle    = `[Axiom] Fix: ${findings[0]?.type ?? 'violation'} in ${entityName}`;
  const prBody     = buildPrBody(findings, patch);

  logger.info(
    { branch: branchName, entity: entityName, riskScore: patch.riskScore },
    'Creating PR for validated patch'
  );

  try {
    const result = await createPullRequest({
      owner:         repoInfo.owner,
      repo:          repoInfo.repo,
      baseBranch:    repoInfo.baseBranch,
      branchName,
      commitMessage: `fix: ${findings[0]?.type ?? 'violation'} in ${entityName} [axiom]`,
      patchContent:  patch.unifiedDiff,
      prTitle,
      prBody,
    });

    logger.info(
      { prUrl: result.prUrl, prNumber: result.prNumber, riskScore: patch.riskScore },
      'PR created successfully'
    );

    return result;
  } catch (err) {
    logger.error({ err, entityName }, 'Failed to create PR');
    throw err;
  }
};

export { buildAndCreatePR, RepoInfo };