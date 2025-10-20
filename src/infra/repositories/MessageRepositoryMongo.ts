/**
 * 모듈: MessageRepository MongoDB 구현
 * 책임
 * - messages 컬렉션에 대한 영속화 어댑터를 제공한다.
 * 외부 의존
 * - mongodb 드라이버, getMongo 커넥션 팩토리
 * 공개 인터페이스
 * - MessageRepository 구현체
 * 로깅 컨텍스트
 * - 실제 구현 시 중앙 로거를 사용하고 correlationId를 포함한다.
 *
 * 현재 상태
 * - 계약 확정 전 단계로, 모든 메서드는 NotImplemented 에러를 던진다.
 */
import type { Collection } from 'mongodb';

import { Message } from '../../core/domain/Message';
import { MessageRepository } from '../../core/ports/MessageRepository';
import { getMongo } from '../db/mongodb';
import type { MessageRole, ContentBlock } from '../../shared/dtos/ai';


/**
 * 메시지 문서 형식
 * - 컬렉션: messages
 * - 커서: _id 문자열 기준 ASC 페이징
 * @param _id 내부 메시지 식별자(UUID/ULID)
 * @param conversationId 소속 대화 ID(UUID/ULID)
 * @param role 메시지 역할
 * @param content 컨텐츠 블록 배열
 * @param createdAt RFC3339 UTC 생성 시각
 * @param updatedAt RFC3339 UTC 수정 시각
 */
type MessageDoc = {
  _id: string;
  conversationId: string;
  role: MessageRole;
  content: ContentBlock[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * MessageRepository (MongoDB 구현)
 * - 컬렉션: messages
 * - 커서: _id 문자열 기준 ASC 페이징
 */
export class MessageRepositoryMongo implements MessageRepository {
  private col(): Collection<MessageDoc> { return getMongo().db().collection<MessageDoc>('messages'); }

  /**
   * 메시지 문서 생성(V2 입력)
   * @description
   * - 현재는 계약 확정 전 단계로 실제 DB 작업을 수행하지 않는다.
   * @param _input V2 메시지 입력(미사용)
   * @returns Promise<Message>
   * @throws {Error} 항상 NotImplemented 에러를 던진다.
   */
  async create(_input: {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: ContentBlock[];
    createdAt: string;
    updatedAt: string;
  }): Promise<Message> {
    throw new Error('NotImplemented: MessageRepositoryMongo.create');
  }

  /**
   * 대화별 메시지 커서 페이징.
   * - 정렬: _id ASC
   * - 커서: 마지막 항목의 _id를 opaque 문자열로 반환
   * @param conversationId 대화 ID
   * @param limit 페이지 크기(1~100)
   * @param cursor 다음 페이지 시작점(_id)
   * @returns items와 nextCursor(없으면 null)
   */
  /**
   * 대화별 메시지 커서 페이징(스텁)
   * @param _conversationId 대화 ID
   * @param _limit 페이지 크기(1~100)
   * @param _cursor 다음 페이지 커서(opaque)
   * @returns 항상 NotImplemented 에러를 throw
   * @throws {Error} NotImplemented
   */
  async listByConversation(_conversationId: string, _limit: number, _cursor?: string): Promise<{ items: Message[]; nextCursor?: string | null }> {
    throw new Error('NotImplemented: MessageRepositoryMongo.listByConversation');
  }
}
