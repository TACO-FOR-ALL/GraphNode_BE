import { initMySql } from './mysql';
import { initMongo } from './mongodb';
import { loadEnv } from '../../config/env';

/**
 * MySQL/MongoDB를 순차 초기화한다. ENV 유효성 검증 포함.
 * @returns Promise<void>
 * @throws {Error} 각 DB 연결 실패 또는 ENV 검증 실패 시
 */
export async function initDatabases() {
  const env = loadEnv();
  await initMySql(env.MYSQL_URL);
  await initMongo(env.MONGODB_URL);
}
