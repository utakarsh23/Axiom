import { runQuery } from '../db/client';

// Serializes a Neo4j node record to a plain object
function toPlain(record: any, key: string): any {
  return record.get(key).properties;
}

// Collects unique ExternalService nodes from CALLS_EXTERNAL edge records
function extractUniqueExternalNodes(edgeRecords: any[]): any[] {
  const map = new Map<string, any>();
  for (const r of edgeRecords) {
    const node = r.get('externalNode').properties;
    map.set(node.name, node);
  }
  return Array.from(map.values());
}

// Returns the full live graph for all repos in a workspace
async function getWorkspaceGraph(workspaceId: string) {
  const nodeRecords = await runQuery(
    `MATCH (n { workspaceId: $workspaceId })
     WHERE n.validTo IS NULL AND NOT n:ExternalService
     RETURN n`,
    { workspaceId }
  );

  const edgeRecords = await runQuery(
    `MATCH (a { workspaceId: $workspaceId })-[r]->(b { workspaceId: $workspaceId })
     WHERE r.validTo IS NULL AND a.validTo IS NULL AND b.validTo IS NULL
       AND NOT b:ExternalService
     RETURN a.name AS source, b.name AS target, type(r) AS type`,
    { workspaceId }
  );

  const externalEdgeRecords = await runQuery(
    `MATCH (a { workspaceId: $workspaceId })-[r:CALLS_EXTERNAL]->(ext:ExternalService { workspaceId: $workspaceId })
     WHERE r.validTo IS NULL AND a.validTo IS NULL
     RETURN a.name AS source, ext.name AS target, ext AS externalNode`,
    { workspaceId }
  );

  const nodes = [
    ...nodeRecords.map(r => toPlain(r, 'n')),
    ...extractUniqueExternalNodes(externalEdgeRecords),
  ];

  const edges = [
    ...edgeRecords.map(r => ({
      source: r.get('source'),
      target: r.get('target'),
      type: r.get('type'),
    })),
    ...externalEdgeRecords.map(r => ({
      source: r.get('source'),
      target: r.get('target'),
      type: 'CALLS_EXTERNAL',
    })),
  ];

  return { nodes, edges };
}

// Returns the live graph scoped to a single repo — cross-repo edges excluded
async function getRepoGraph(workspaceId: string, repoId: string) {
  const nodeRecords = await runQuery(
    `MATCH (n { workspaceId: $workspaceId, repoId: $repoId })
     WHERE n.validTo IS NULL
     RETURN n`,
    { workspaceId, repoId }
  );

  const edgeRecords = await runQuery(
    `MATCH (a { workspaceId: $workspaceId, repoId: $repoId })-[r]->(b { workspaceId: $workspaceId, repoId: $repoId })
     WHERE r.validTo IS NULL AND a.validTo IS NULL AND b.validTo IS NULL
     RETURN a.name AS source, b.name AS target, type(r) AS type`,
    { workspaceId, repoId }
  );

  const externalEdgeRecords = await runQuery(
    `MATCH (a { workspaceId: $workspaceId, repoId: $repoId })-[r:CALLS_EXTERNAL]->(ext:ExternalService { workspaceId: $workspaceId })
     WHERE r.validTo IS NULL AND a.validTo IS NULL
     RETURN a.name AS source, ext.name AS target, ext AS externalNode`,
    { workspaceId, repoId }
  );

  const nodes = [
    ...nodeRecords.map(r => toPlain(r, 'n')),
    ...extractUniqueExternalNodes(externalEdgeRecords),
  ];

  const edges = [
    ...edgeRecords.map(r => ({
      source: r.get('source'),
      target: r.get('target'),
      type: r.get('type'),
    })),
    ...externalEdgeRecords.map(r => ({
      source: r.get('source'),
      target: r.get('target'),
      type: 'CALLS_EXTERNAL',
    })),
  ];

  return { nodes, edges };
}

// Returns blast radius for an entity — upstream callers + downstream callees
// Depth capped at 10 hops, results capped at 500 per direction to handle cycles safely
async function getImpact(workspaceId: string, entityName: string) {
  const selfRecords = await runQuery(
    `MATCH (e { name: $entityName, workspaceId: $workspaceId })
     WHERE e.validTo IS NULL
     RETURN e LIMIT 1`,
    { entityName, workspaceId }
  );

  const downstreamRecords = await runQuery(
    `MATCH (start { name: $entityName, workspaceId: $workspaceId })
     WHERE start.validTo IS NULL
     MATCH (start)-[:CALLS*1..10]->(downstream)
     WHERE downstream.validTo IS NULL
     RETURN DISTINCT downstream
     LIMIT 500`,
    { entityName, workspaceId }
  );

  const upstreamRecords = await runQuery(
    `MATCH (start { name: $entityName, workspaceId: $workspaceId })
     WHERE start.validTo IS NULL
     MATCH (upstream)-[:CALLS*1..10]->(start)
     WHERE upstream.validTo IS NULL
     RETURN DISTINCT upstream
     LIMIT 500`,
    { entityName, workspaceId }
  );

  return {
    entity: selfRecords.map(r => toPlain(r, 'e'))[0] ?? null,
    upstream: upstreamRecords.map(r => toPlain(r, 'upstream')),
    downstream: downstreamRecords.map(r => toPlain(r, 'downstream')),
  };
}

// Returns graph state at a specific commit SHA
// Nodes/edges active at that commit: validFrom = commit OR (still active with validTo IS NULL)
// Note: full temporal ordering (commit A before commit B) requires a commit sequence table —
// this simplified version answers "what existed at exactly this commit SHA"
async function getTimelineGraph(workspaceId: string, commit: string) {
  const nodeRecords = await runQuery(
    `MATCH (n { workspaceId: $workspaceId })
    WHERE n.validFrom <= $commit
      AND (n.validTo IS NULL OR n.validTo > $commit)
    RETURN n`,
    { workspaceId, commit }
  );

  const edgeRecords = await runQuery(
    `MATCH (a { workspaceId: $workspaceId })-[r]->(b { workspaceId: $workspaceId })
    WHERE r.validFrom <= $commit
      AND (r.validTo IS NULL OR r.validTo > $commit)
      AND a.validFrom <= $commit
      AND (a.validTo IS NULL OR a.validTo > $commit)
      AND b.validFrom <= $commit
      AND (b.validTo IS NULL OR b.validTo > $commit)
    RETURN a.name AS source, b.name AS target, type(r) AS type`,
    { workspaceId, commit }
  );

  return {
    commit,
    nodes: nodeRecords.map(r => toPlain(r, 'n')),
    edges: edgeRecords.map(r => ({
      source: r.get('source'),
      target: r.get('target'),
      type: r.get('type'),
    })),
  };
}

// ── Lazy-expand endpoints (per frontend.md) ─────────────────────────────────

// Returns entry-point files — functions with zero incoming CALLS edges
async function getEntryFiles(workspaceId: string, repoId: string) {
  const records = await runQuery(
    `MATCH (n:Function { workspaceId: $workspaceId, repoId: $repoId })
     WHERE n.validTo IS NULL AND NOT ()-[:CALLS]->(n)
     RETURN DISTINCT n.filePath AS file, collect(n.name) AS functions`,
    { workspaceId, repoId }
  );

  return {
    files: records.map(r => ({
      file: r.get('file'),
      functions: r.get('functions'),
    })),
  };
}

// Returns all entities inside a specific file
async function getFileFunctions(workspaceId: string, repoId: string, filePath: string) {
  const records = await runQuery(
    `MATCH (n { workspaceId: $workspaceId, repoId: $repoId, filePath: $filePath })
     WHERE n.validTo IS NULL
     RETURN n.name AS name, n.kind AS kind, labels(n)[0] AS type`,
    { workspaceId, repoId, filePath }
  );

  return {
    functions: records.map(r => ({
      name: r.get('name'),
      kind: r.get('kind'),
      type: r.get('type'),
    })),
  };
}

// Returns what a specific function calls — internal + external
async function getFunctionCalls(
  workspaceId: string,
  repoId: string,
  name: string,
  filePath: string
) {
  const records = await runQuery(
    `MATCH (n:Function { workspaceId: $workspaceId, repoId: $repoId, name: $name, filePath: $filePath })
     WHERE n.validTo IS NULL
     OPTIONAL MATCH (n)-[:CALLS]->(internal) WHERE internal.validTo IS NULL
     OPTIONAL MATCH (n)-[:CALLS_EXTERNAL]->(ext) WHERE ext.validTo IS NULL
     RETURN
       collect(DISTINCT { name: internal.name, file: internal.filePath, kind: internal.kind }) AS internalCalls,
       collect(DISTINCT { name: ext.name }) AS externalCalls`,
    { workspaceId, repoId, name, filePath }
  );

  const row = records[0];
  return {
    internalCalls: row ? row.get('internalCalls').filter((c: any) => c.name !== null) : [],
    externalCalls: row ? row.get('externalCalls').filter((c: any) => c.name !== null) : [],
  };
}

async function checkCommitExists(workspaceId: string, commit: string) {
  const records = await runQuery(
    `
    MATCH (n { workspaceId: $workspaceId })
    WHERE n.validFrom = $commit OR n.validTo = $commit
    RETURN 1
    LIMIT 1
    `,
    { workspaceId, commit }
  );

  return records.length > 0;
}

export {
  getWorkspaceGraph,
  getRepoGraph,
  getImpact,
  getTimelineGraph,
  getEntryFiles,
  getFileFunctions,
  getFunctionCalls,
  checkCommitExists
};