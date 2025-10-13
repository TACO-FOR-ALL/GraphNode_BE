import mysql from 'mysql2/promise';

import { logger } from '../../shared/utils/logger';

export type MySqlPool = mysql.Pool;
let pool: MySqlPool | undefined;

export async function initMySql(url: string) {
  pool = mysql.createPool(url);
  await pool.query('SELECT 1');
  logger.info({ event: 'db.connected', system: 'mysql' }, 'MySQL connected');
  return pool;
}

export function getMySql(): MySqlPool {
  if (!pool) throw new Error('MySQL not initialized');
  return pool;
}
