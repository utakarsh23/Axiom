// A single finding produced by Tier 1 or Tier 2 checks.
// Passed to LLM Service as part of the structured input at Tier 3.
interface Finding {
  source:      'graph' | 'semgrep' | 'rulebook' | 'depaudit';
  type:        string;        // e.g. 'circular_dependency', 'sql_injection', 'naming_violation'
  description: string;
  severity?:   'LOW' | 'MEDIUM' | 'HIGH';
  line?:       number;        // line number in entity code (Semgrep findings)
  code?:       string;        // the flagged code fragment
  path?:       string[];      // graph path (cycle findings)
  entity?:     string;        // entity name (rulebook findings)
  expected?:   string;        // expected value (naming convention findings)
  ruleId?:     string;        // Semgrep rule ID
}

export { Finding };