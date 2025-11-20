import fs from 'fs/promises';
import path from 'path';
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
    multipleStatements: true, // 다중 쿼리 허용 (init 스크립트용)
  });

  try {
    const initSqlPath = path.join(__dirname, 'mysql/init/001_init.sql');
    const sql = await fs.readFile(initSqlPath, 'utf-8');
    // 세미콜론으로 분리하여 실행 (multipleStatements: true가 있어도 안전하게 분리 실행 권장)
    const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    logger.info({ event: 'db.init', system: 'mysql' }, 'Executed init SQL');
  } catch (err) {
    logger.warn({ event: 'db.init_failed', system: 'mysql', err }, 'Failed to execute init SQL (file missing or error)');
  }

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
