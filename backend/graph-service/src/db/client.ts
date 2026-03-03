import neo4j, { Driver, Session } from 'neo4j-driver';
import { config } from '../config';
import { logger } from '../logger';

let driver: Driver | null = null;

async function connectDB(): Promise<void> {
  try {
    driver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
    );

    // verifyConnectivity() does a real handshake — confirms Neo4j is reachable
    // and credentials are correct before the service starts accepting events
    await driver.verifyConnectivity();
    logger.info({ uri: config.neo4j.uri }, 'Neo4j connected');
  } catch (error: any) {
    logger.error({ error }, 'Neo4j connection failed');
    throw error;
  }
}

async function disconnectDB(): Promise<void> {
  await driver?.close();
  logger.info('Neo4j disconnected');
}

// Returns a new session for running a Cypher query.
// Caller is responsible for closing the session after use.
// Always use try/finally: session.close() in finally block.
function getSession(): Session {
  if (!driver) throw new Error('Neo4j not connected. Call connectDB() first.');
  return driver.session();
}

// Runs a single Cypher query and returns all records.
// Handles session open/close automatically.
// Use this for one-off queries in handlers — avoids boilerplate everywhere.
async function runQuery(
  cypher: string,
  params: Record<string, any> = {}
): Promise<any[]> {
  const session = getSession();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

export { connectDB, disconnectDB, getSession, runQuery };