import neo4j, { Driver } from 'neo4j-driver';

import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { MACRO_GRAPH_SCHEMA_CYPHER } from '../graph/cypher/macroGraph.cypher';

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

    // 애플리케이션 시작 시 연결 가능 여부를 먼저 검증합니다.
    await driver.verifyConnectivity();
    await ensureNeo4jSchema(driver);
    logger.info('Neo4j connected');

    return driver;
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Neo4j');
    throw error;
  }
};

/**
 * Macro Graph Neo4j migration에 필요한 constraint/index를 보장합니다.
 *
 * 현재 schema는 Macro Graph의 관계 기반 저장과 조회 최적화만 담당합니다.
 * - `MacroGraph.userId` unique constraint: 사용자별 루트 그래프 식별
 * - `(userId, id)` constraints: node, cluster, subcluster, relation의 기존 graph id 보존
 * - `origId`, `nodeType`, cluster/relation 조회 index: GraphRouter/GraphAiRouter 조회 최적화
 * - fulltext indexes: graph search/RAG 확장 대비
 *
 * @param neo4jDriver schema 보장을 수행할 Neo4j driver입니다.
 */
async function ensureNeo4jSchema(neo4jDriver: Driver): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const statement of MACRO_GRAPH_SCHEMA_CYPHER) {
      await session.run(statement);
    }
    logger.info({ count: MACRO_GRAPH_SCHEMA_CYPHER.length }, 'Neo4j Macro Graph schema ensured');
  } finally {
    await session.close();
  }
}

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
