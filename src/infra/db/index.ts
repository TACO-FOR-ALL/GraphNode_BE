import { initMySql } from './mysql';
import { initMongo } from './mongodb';
import { loadEnv } from '../../config/env';

export async function initDatabases() {
  const env = loadEnv();
  await initMySql(env.MYSQL_URL);
  await initMongo(env.MONGODB_URL);
}
