import { IRulebook } from '../types/rulebook';
import { Finding } from '../types/finding';
import logger from '../logger';

// Naming convention patterns — maps convention name to a validator function
const namingValidators: Record<string, (name: string) => boolean> = {
  camelCase:        (n) => /^[a-z][a-zA-Z0-9]*$/.test(n),
  PascalCase:       (n) => /^[A-Z][a-zA-Z0-9]*$/.test(n),
  'kebab-case':     (n) => /^[a-z][a-z0-9-]*$/.test(n),
  UPPER_SNAKE_CASE: (n) => /^[A-Z][A-Z0-9_]*$/.test(n),
  snake_case:       (n) => /^[a-z][a-z0-9_]*$/.test(n),
};

// Checks whether a name matches the expected convention.
// Returns a finding if it violates — returns null if clean or convention unknown.
const checkNaming = (
  entityName: string,
  entityType: string,
  rulebook:   IRulebook
): Finding | null => {
  const naming = rulebook.naming;
  if (!naming) return null;

  // Map entity type to the relevant naming rule
  const conventionMap: Record<string, string | undefined> = {
    Function: naming.functions,
    Class:    naming.classes,
    Endpoint: undefined,   // endpoints don't have naming conventions in rulebook
  };

  const expected = conventionMap[entityType];
  if (!expected) return null;

  const validator = namingValidators[expected];
  if (!validator) return null;

  if (!validator(entityName)) {
    return {
      source:      'rulebook',
      type:        'naming_violation',
      description: `Entity "${entityName}" (${entityType}) does not follow ${expected} convention`,
      severity:    'LOW',
      entity:      entityName,
      expected,
    };
  }

  return null;
};

// Checks whether the entity code has a JSDoc block if required by the rulebook.
// A JSDoc block starts with /** — checks for presence at the start of the code.
const checkJsDoc = (entityCode: string, rulebook: IRulebook): Finding | null => {
  if (!rulebook.comments?.requireJsDoc) return null;

  const hasJsDoc = entityCode.trimStart().startsWith('/**');

  if (!hasJsDoc) {
    return {
      source:      'rulebook',
      type:        'missing_jsdoc',
      description: 'Entity is missing a JSDoc comment block — required by workspace rulebook',
      severity:    'LOW',
    };
  }

  return null;
};

// Checks entity code for forbidden patterns defined in the rulebook.
// e.g. console.log, debugger, TODO:
const checkForbiddenPatterns = (
  entityCode: string,
  rulebook:   IRulebook
): Finding[] => {
  const patterns = rulebook.structure?.forbiddenPatterns ?? [];
  const findings: Finding[] = [];

  for (const pattern of patterns) {
    if (entityCode.includes(pattern)) {
      findings.push({
        source:      'rulebook',
        type:        'forbidden_pattern',
        description: `Forbidden pattern "${pattern}" found in entity code`,
        severity:    'LOW',
        code:        pattern,
      });
    }
  }

  return findings;
};

// Checks entity code line count against the maxFunctionLines limit in the rulebook.
const checkLineLimit = (entityCode: string, rulebook: IRulebook): Finding | null => {
  const max = rulebook.structure?.maxFunctionLines;
  if (!max) return null;

  const lineCount = entityCode.split('\n').length;

  if (lineCount > max) {
    return {
      source:      'rulebook',
      type:        'line_limit_exceeded',
      description: `Entity has ${lineCount} lines — exceeds rulebook limit of ${max}`,
      severity:    'LOW',
    };
  }

  return null;
};

// Runs all Tier 2b rulebook checks on the entity.
// Returns empty array if rulebook is null — caller skips Tier 2b entirely in that case.
const runTier2bChecks = (
  entityName: string,
  entityType: string,
  entityCode: string,
  rulebook:   IRulebook | null
): Finding[] => {
  // Rulebook not defined for this workspace — skip all checks
  if (!rulebook) return [];

  const findings: Finding[] = [];

  const namingFinding = checkNaming(entityName, entityType, rulebook);
  if (namingFinding) findings.push(namingFinding);

  const jsDocFinding = checkJsDoc(entityCode, rulebook);
  if (jsDocFinding) findings.push(jsDocFinding);

  const forbiddenFindings = checkForbiddenPatterns(entityCode, rulebook);
  findings.push(...forbiddenFindings);

  const lineLimitFinding = checkLineLimit(entityCode, rulebook);
  if (lineLimitFinding) findings.push(lineLimitFinding);

  logger.info({ findingsCount: findings.length }, 'Tier 2b rulebook checks complete');

  return findings;
};

export { runTier2bChecks };