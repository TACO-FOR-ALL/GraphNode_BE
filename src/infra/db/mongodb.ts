import { MongoClient } from 'mongodb';

import { logger } from '../../shared/utils/logger';

/**
 * 모듈: MongoDB Connection (데이터베이스 연결)
 * 
 * 책임:
 * - MongoDB 서버와의 연결을 수립하고 관리합니다.
 * - 애플리케이션 시작 시 필요한 인덱스(Index)를 자동으로 생성합니다.
 * - 싱글톤 패턴을 사용하여 어디서든 동일한 DB 클라이언트 인스턴스에 접근할 수 있게 합니다.
 */

// MongoDB 클라이언트 인스턴스 (싱글톤)
export let client: MongoClient | undefined;

/**
 * MongoDB 초기화 함수
 * 
 * 역할:
 * 1. MongoDB 서버에 연결합니다.
 * 2. 연결 성공 시 로그를 남깁니다.
 * 3. ensureIndexes()를 호출하여 성능에 필수적인 인덱스를 생성합니다.
 * 
 * @param url MongoDB 연결 문자열 (Connection String)
 * @returns 초기화된 MongoClient 객체
 * @throws {Error} 연결 실패 시 에러 발생
 */
export async function initMongo(url: string) {
  client = new MongoClient(url);
  await client.connect();
  logger.info({ event: 'db.connected', system: 'mongodb' }, 'MongoDB connected');
  
  // 인덱스 생성 (비동기)
  await ensureIndexes();
  
  return client;
}

/**
 * MongoDB 클라이언트 획득 함수
 * 
 * 역할:
 * - 초기화된 클라이언트 인스턴스를 반환합니다.
 * - 초기화되지 않은 상태에서 호출하면 에러를 발생시켜 개발자의 실수를 방지합니다.
 * 
 * @returns MongoClient 인스턴스
 * @throws {Error} DB가 아직 연결되지 않았을 때
 */
export function getMongo(): MongoClient {
  if (!client) throw new Error('MongoDB not initialized');
  return client;
}

/**
 * 인덱스 보장 함수 (내부용)
 * 
 * 역할:
 * - 쿼리 성능 향상을 위해 필요한 인덱스가 있는지 확인하고, 없으면 생성합니다.
 * - ownerUserId, conversationId 등 자주 조회 조건으로 쓰이는 필드에 인덱스를 겁니다.
 */
async function ensureIndexes() {
  const db = getMongo().db();
  
  // conversations 컬렉션: 소유자 ID로 조회하는 경우가 많으므로 인덱스 생성
  await db.collection('conversations').createIndex({ ownerUserId: 1, _id: 1 });
  
  // messages 컬렉션: 대화방 ID로 메시지 목록을 조회하므로 인덱스 생성
  await db.collection('messages').createIndex({ conversationId: 1, _id: 1 });
  
  logger.info({ event: 'db.migrations_checked' }, 'DB indexes ensured');
}
