import mysql from 'mysql2/promise';

import { MYSQL_INIT_SCHEMA } from './mysql/schema'; // 초기화 스키마 SQL
import { logger } from '../../shared/utils/logger';

/**
 * 모듈: MySQL Connection (관계형 데이터베이스 연결)
 * 
 * 책임:
 * - MySQL 데이터베이스와의 연결 풀(Connection Pool)을 생성하고 관리합니다.
 * - 애플리케이션 시작 시 초기 테이블 스키마(Schema)를 자동으로 적용합니다.
 */

export type MySqlPool = mysql.Pool;
let pool: MySqlPool | undefined;

/**
 * MySQL 초기화 함수
 * 
 * 역할:
 * 1. 커넥션 풀을 생성합니다. (풀은 여러 연결을 미리 만들어두고 재사용하는 방식입니다)
 * 2. 초기화 SQL(테이블 생성 등)을 실행합니다.
 * 3. 연결 상태를 확인(Ping)합니다.
 * 
 * @param url MySQL 연결 URL (DSN 형식)
 * @returns 초기화된 Connection Pool
 */
export async function initMySql(url: string) {
  // 커넥션 풀 설정
  pool = mysql.createPool({
    uri: url,                // 연결 정보
    supportBigNumbers: true, // 큰 숫자(BIGINT) 처리 지원
    bigNumberStrings: true,  // JS의 숫자 정밀도 한계를 넘는 경우 문자열로 반환
    multipleStatements: true, // 한 번에 여러 SQL 문 실행 허용 (초기화 스크립트용)
  });

  try {
    // 초기화 스키마 실행
    const sql = MYSQL_INIT_SCHEMA;
    
    // SQL 문을 세미콜론(;)으로 분리하여 순차적으로 실행
    // (안전성을 위해 하나씩 실행하는 것이 좋습니다)
    const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    logger.info({ event: 'db.init', system: 'mysql' }, 'Executed init SQL');
  } catch (err) {
    // 초기화 실패 시 경고 로그 (이미 테이블이 있는 경우 등일 수 있음)
    logger.warn({ event: 'db.init_failed', system: 'mysql', err }, 'Failed to execute init SQL');
  }

  // 연결 확인 (Ping)
  await pool.query('SELECT 1');
  logger.info({ event: 'db.connected', system: 'mysql' }, 'MySQL connected');
  return pool;
}

/**
 * MySQL 풀 획득 함수
 * 
 * @returns 초기화된 MySqlPool
 * @throws {Error} 초기화되지 않았을 때
 */
export function getMySql(): MySqlPool {
  if (!pool) throw new Error('MySQL not initialized');
  return pool;
}
