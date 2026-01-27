import { initMongo } from './mongodb';
import { loadEnv } from '../../config/env';
import prisma from './prisma';

/**
 * MySQL(Prisma)/MongoDB를 순차 초기화한다. ENV 유효성 검증 포함.
 * @returns Promise<void>
 * @throws {Error} 각 DB 연결 실패 또는 ENV 검증 실패 시
 */
export async function initDatabases() {
  const env = loadEnv();
  // Prisma Connection
  await prisma.$connect();

  await initMongo(env.MONGODB_URL);

  // Qdrant 초기화 (스켈레톤), 현재는 사용 안하기에 우선 주석
  // await initQdrant(env.QDRANT_URL, env.QDRANT_API_KEY);
}
