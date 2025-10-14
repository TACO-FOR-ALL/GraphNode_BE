import { MongoClient } from 'mongodb';

import { logger } from '../../shared/utils/logger';

let client: MongoClient | undefined;

/**
 * MongoDB 클라이언트를 초기화하고 필수 인덱스를 보장한다.
 * @param url MongoDB 연결 문자열
 * @returns 초기화된 MongoClient
 * @throws {Error} 연결 실패 시
 */
export async function initMongo(url: string) {
  client = new MongoClient(url);
  await client.connect();
  logger.info({ event: 'db.connected', system: 'mongodb' }, 'MongoDB connected');
  await ensureIndexes();
  return client;
}

/**
 * 초기화된 MongoClient 반환.
 * @returns MongoClient 인스턴스
 * @throws {Error} initMongo가 선행되지 않은 경우
 */
export function getMongo(): MongoClient {
  if (!client) throw new Error('MongoDB not initialized');
  return client;
}

async function ensureIndexes() {
  const db = getMongo().db();
  await db.collection('conversations').createIndex({ ownerUserId: 1, _id: 1 });
  await db.collection('messages').createIndex({ conversationId: 1, _id: 1 });
  logger.info({ event: 'db.migrations_checked' }, 'DB indexes ensured');
}
