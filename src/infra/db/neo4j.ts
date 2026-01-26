import neo4j, { Driver } from 'neo4j-driver';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';

let driver: Driver | null = null;

export const initNeo4j = async (): Promise<Driver> => {
  if (driver) return driver;

  const env = loadEnv();
  const uri = env.NEO4J_URI || 'bolt://localhost:7687';
  const user = env.NEO4J_USERNAME || 'neo4j';
  const password = env.NEO4J_PASSWORD || 'password';

  logger.info({ uri, user }, 'Initializing Neo4j driver...');

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

    // 연결 검증
    await driver.verifyConnectivity();
    logger.info('✅ Neo4j connected');

    return driver;
  } catch (error) {
    logger.error({ error }, '❌ Failed to connect to Neo4j');
    throw error;
  }
};

export const getNeo4jDriver = (): Driver => {
  if (!driver) {
    throw new Error('Neo4j driver not initialized. Call initNeo4j() first.');
  }
  return driver;
};

export const closeNeo4j = async (): Promise<void> => {
  if (driver) {
    await driver.close();
    driver = null;
    logger.info('Neo4j connection closed');
  }
};
