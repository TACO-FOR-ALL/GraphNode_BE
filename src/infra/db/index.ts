import { initMongo } from './mongodb';
import { loadEnv } from '../../config/env';
import prisma from './prisma';
import { initRedis } from '../redis/client';
import { initChroma } from './chroma';
import { logger } from '../../shared/utils/logger';

import { initNeo4j } from './neo4j';

/**
 * RDB(Prisma)/MongoDB/Redis를 순차 초기화한다. ENV 유효성 검증 포함.
 * @returns Promise<void>
 * @throws {Error} 각 DB 연결 실패 또는 ENV 검증 실패 시
 */
export async function initDatabases() {
  const env = loadEnv();

  // 1. Prisma Connection
  await prisma.$connect();

  // 2. MongoDB Connection
  await initMongo(env.MONGODB_URL);

  // 3. Redis Connection (Publisher & Subscriber)
  await initRedis(env.REDIS_URL);

  // 4. ChromaDB Connection (dummy/test-key 는 로컬 E2E 에서 skip)
  const chromaKey = env.CHROMA_API_KEY?.trim();
  if (chromaKey && chromaKey !== 'dummy' && chromaKey !== 'test-key') {
    await initChroma();
  } else {
    logger.warn('Skipping ChromaDB init (CHROMA_API_KEY not configured for cloud)');
  }

  // 5. Neo4j connection
  await initNeo4j();
}

/**
 * 모든 데이터베이스 연결을 일괄 종료한다.
 */
export async function closeDatabases() {
  const { disconnectMongo } = require('./mongodb');
  const { closeRedis } = require('../redis/client');

  try {
    await prisma.$disconnect();
    await disconnectMongo();
    await closeRedis();
  } catch (err) {
    // 종료 중 에러는 로깅만 하고 무시 (테스트 환경 안정성용)
    console.error('Error closing databases:', err);
  }
}
