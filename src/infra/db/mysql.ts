import mysql from 'mysql2/promise';

import { logger } from '../../shared/utils/logger';

export type MySqlPool = mysql.Pool;
let pool: MySqlPool | undefined;

/**
 * MySQL 풀 초기화 및 연결 확인.
 * @param url 커넥션 URL(mysql2/promise 호환 DSN)
 * @returns 초기화된 풀
 * @throws {Error} 연결 실패 시
 */
export async function initMySql(url: string) {
  pool = mysql.createPool({
    uri: url,                // DSN을 그대로 사용
    supportBigNumbers: true, // BIGINT 처리
    bigNumberStrings: true,  // 문자열로 반환
    // dateStrings: true,    // 필요 시 DATE/TIMESTAMP도 문자열로
    // namedPlaceholders: true, // 선택
  });
  await pool.query('SELECT 1');
  logger.info({ event: 'db.connected', system: 'mysql' }, 'MySQL connected');
  return pool;
}

/**
 * 초기화된 MySQL 풀 반환.
 * @returns mysql2/promise Pool
 * @throws {Error} initMySql이 선행되지 않은 경우
 */
export function getMySql(): MySqlPool {
  if (!pool) throw new Error('MySQL not initialized');
  return pool;
}
