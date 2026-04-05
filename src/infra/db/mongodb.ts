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
 * MongoDB 연결 종료 함수
 *
 * 역할:
 * 1. 활성 중인 클라이언트 객체가 있다면 연결을 명확히 닫습니다.
 */
export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
  }
}

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

  // conversations 컬렉션: 소유자 ID로 조회하며 최신순 정렬 및 페이징을 위해 updatedAt 인덱스 추가
  await db
    .collection('conversations')
    .createIndex({ ownerUserId: 1, deletedAt: 1, updatedAt: -1, _id: 1 });

  // messages 컬렉션: 대화방 ID + deletedAt 필터 + createdAt 정렬을 커버하는 복합 인덱스
  // findAllByConversationId / findAllByConversationIds 쿼리:
  //   { conversationId, deletedAt: null } .sort({ createdAt: 1 }) → 이 인덱스가 완전 커버
  await db.collection('messages').createIndex({ conversationId: 1, deletedAt: 1, createdAt: 1 });

  // Graph Collections: {id, userId} 조합으로 조회하므로 복합 인덱스 생성 (Unique)
  await db.collection('graph_nodes').createIndex({ userId: 1, id: 1 }, { unique: true });
  await db.collection('graph_edges').createIndex({ userId: 1, id: 1 }, { unique: true });
  await db.collection('graph_clusters').createIndex({ userId: 1, id: 1 }, { unique: true });

  // Graph Stats: 사용자당 하나이므로 userId 인덱스
  await db.collection('graph_stats').createIndex({ userId: 1 }, { unique: true });

  // Missing indexes: graph_subclusters, graph_summaries
  await db.collection('graph_subclusters').createIndex({ userId: 1 });
  await db.collection('graph_summaries').createIndex({ userId: 1 });

  // notifications: replay 조회는 { userId, _id(cursor) } 조합을 사용합니다.
  await db.collection('notifications').createIndex({ userId: 1, _id: 1 });

  // notifications 보관 정책(선택): expiresAt(BSON Date) 기준 TTL 인덱스
  // - 주의: expiresAt 필드 값이 반드시 'Date 객체'여야 하며, 숫자(number)일 경우 동작하지 않습니다.
  // - expiresAt가 없는 문서는 TTL로 자동 삭제되지 않습니다.
  // 목적: 알림 이력을 무한히 쌓지 않고 운영 정책(예: 7일)으로 자동 정리하기 위함
  await db.collection('notifications').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // notes 컬렉션: listNotes 쿼리 패턴 { ownerUserId, folderId, deletedAt: null } + sort(updatedAt: -1) 커버
  await db.collection('notes').createIndex({ ownerUserId: 1, folderId: 1, deletedAt: 1, updatedAt: -1 });

  // --- 통합 검색(Full-Text Search)을 위한 텍스트 인덱스 추가 ---

  // notes: 제목(10)과 내용(1)에 가중치를 두어 검색
  await db.collection('notes').createIndex(
    { title: 'text', content: 'text' },
    {
      weights: { title: 10, content: 1 },
      name: 'notes_full_text_search',
    }
  );

  // conversations: 대화 제목 검색 (가중치 10)
  await db.collection('conversations').createIndex(
    { title: 'text' },
    {
      weights: { title: 10 },
      name: 'conversations_full_text_search',
    }
  );

  // messages: 메시지 내용 검색 (가중치 1)
  await db.collection('messages').createIndex(
    { content: 'text' },
    {
      weights: { content: 1 },
      name: 'messages_full_text_search',
    }
  );

  logger.info({ event: 'db.migrations_checked' }, 'DB indexes ensured');
}
