import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Finding } from '../types/finding';
import logger from '../logger';

// Shape of a single Semgrep result entry
interface SemgrepResult {
  check_id: string;
  path:     string;
  start:    { line: number };
  extra:    { message: string; severity: string };
}

interface SemgrepOutput {
  results: SemgrepResult[];
}

// Runs Semgrep on the entity code string by writing to a temp file.
// Semgrep must be installed in the environment (semgrep binary on PATH).
// Returns findings — empty means no code pattern violations.
const runSemgrep = (entityCode: string, language: string): Finding[] => {
  const findings: Finding[] = [];

  // Write entity code to a temp file — Semgrep requires a file path
  const ext      = language === 'python' ? 'py' : language === 'java' ? 'java' : 'ts';
  const tmpFile  = path.join(os.tmpdir(), `axiom-scan-${Date.now()}.${ext}`);

  try {
    fs.writeFileSync(tmpFile, entityCode, 'utf-8');

    // Run Semgrep with auto config — uses built-in rule registry
    const output = execSync(
      `semgrep --config=auto --json ${tmpFile}`,
      { timeout: 30_000, encoding: 'utf-8' }
    );

    const parsed = JSON.parse(output) as SemgrepOutput;

    for (const result of parsed.results) {
      findings.push({
        source:      'semgrep',
        type:        result.check_id,
        description: result.extra.message,
        ruleId:      result.check_id,
        line:        result.start.line,
        severity:    result.extra.severity as 'LOW' | 'MEDIUM' | 'HIGH',
      });
    }
  } catch (err: any) {
    // Semgrep exits with code 1 when it finds violations — not a real error
    // Exit code 2+ is a real Semgrep failure
    if (err.status === 1 && err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout as string) as SemgrepOutput;
        for (const result of parsed.results) {
          findings.push({
            source:      'semgrep',
            type:        result.check_id,
            description: result.extra.message,
            ruleId:      result.check_id,
            line:        result.start.line,
            severity:    result.extra.severity as 'LOW' | 'MEDIUM' | 'HIGH',
          });
        }
      } catch (parseErr) {
        logger.error({ parseErr }, 'Failed to parse Semgrep output');
      }
    } else {
      logger.warn({ err }, 'Semgrep scan failed — skipping code pattern checks');
    }
  } finally {
    // Always clean up the temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) { /* ignore cleanup errors */ }
  }

  return findings;
};

// Runs npm audit on the repo working directory and returns CVE findings.
// repoPath must be the local path where package.json exists.
// Returns empty array if audit is unavailable or repo has no package.json.
const runDepAudit = (repoPath: string): Finding[] => {
  const findings: Finding[] = [];

  try {
    execSync('npm audit --json', {
      cwd:      repoPath,
      timeout:  30_000,
      encoding: 'utf-8',
    });

    // Exit code 0 — no vulnerabilities found
  } catch (err: any) {
    // npm audit exits with non-zero when vulns found — parse the output
    if (err.stdout) {
      try {
        const audit = JSON.parse(err.stdout as string);
        const vulns = audit?.vulnerabilities ?? {};

        for (const [name, data] of Object.entries(vulns as Record<string, any>)) {
          if (data.severity && data.severity !== 'info') {
            findings.push({
              source:      'depaudit',
              type:        'dependency_vulnerability',
              description: `Dependency "${name}" has a ${data.severity} severity vulnerability`,
              severity:    (data.severity.toUpperCase()) as 'LOW' | 'MEDIUM' | 'HIGH',
              entity:      name,
            });
          }
        }
      } catch (parseErr) {
        logger.warn({ parseErr }, 'Failed to parse npm audit output');
      }
    } else {
      logger.warn({ err }, 'npm audit failed — skipping dependency checks');
    }
  }

  return findings;
};

// Runs all Tier 2a checks — Semgrep + dependency audit in sequence.
const runTier2aChecks = (
  entityCode: string,
  language:   string,
  repoPath:   string
): Finding[] => {
  const semgrepFindings = runSemgrep(entityCode, language);
  const auditFindings   = runDepAudit(repoPath);
  const all             = [...semgrepFindings, ...auditFindings];

  logger.info({ findingsCount: all.length }, 'Tier 2a checks complete');

  return all;
};

export { runTier2aChecks };