/**
 * 모듈: ConversationRepository MongoDB 구현
 * 책임
 * - conversations 컬렉션에 대한 영속화 어댑터를 제공한다.
 * 외부 의존
 * - mongodb 드라이버(컬렉션 접근), getMongo 커넥션 팩토리
 * 공개 인터페이스
 * - ConversationRepository 구현체
 * 로깅 컨텍스트
 * - 실제 구현 시 중앙 로거를 사용하고 traceparent에서 correlationId를 바인딩한다.
 *
 * 현재 상태
 * - DTO/계약 확정 전으로, 모든 메서드는 NotImplemented 에러를 던진다.
 */
import type { Collection } from 'mongodb';

import { Conversation } from '../../core/domain/Conversation';
import { ConversationRepository } from '../../core/ports/ConversationRepository';
import { getMongo } from '../db/mongodb';
import type { Provider, Source } from '../../shared/dtos/ai';
import type { ConversationDoc } from '../db/models/ai';

/**
 * ConversationRepository (MongoDB 구현)
 * - 컬렉션: conversations
 * - 커서: _id 문자열을 opaque 커서로 사용(정렬: _id ASC)
 */
export class ConversationRepositoryMongo implements ConversationRepository {
  private col(): Collection<ConversationDoc> { return getMongo().db().collection<ConversationDoc>('conversations'); }

  /**
   * 신규 문서 삽입(V2 입력 기반)
   * @description
   * - 현재는 계약 확정 전 단계로 실제 DB 작업을 수행하지 않는다.
   * @param _input V2 대화 메타데이터 입력(미사용)
   * @returns Promise<Conversation>
   * @throws {Error} 항상 NotImplemented 에러를 던진다.
   * @example
   * await repo.create({...}); // 런타임 시 NotImplemented 오류
   */
  async create(_input: {
    id: string;
    ownerUserId: number;
    provider: Provider;
    model: string;
    title?: string | null;
    source?: Source;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
  }): Promise<Conversation> {
    throw new Error('NotImplemented: ConversationRepositoryMongo.create');
  }

  /**
   * ID로 단건 조회.
   * @param id 대화 ID(UUID/ULID)
   * @returns Conversation 또는 null
   */
  /**
   * ID로 단건 조회(스텁)
   * @param _id 대화 ID(UUID/ULID)
   * @returns 항상 NotImplemented 에러를 throw
   * @throws {Error} NotImplemented
   */
  async findById(_id: string): Promise<Conversation | null> {
    throw new Error('NotImplemented: ConversationRepositoryMongo.findById');
  }

  /**
   * 소유자 기준 커서 페이징.
   * - 정렬: _id ASC
   * - 커서: 마지막 항목의 _id를 opaque 문자열로 반환
   * @param ownerUserId 소유 사용자 ID
   * @param limit 페이지 크기(1~100)
   * @param cursor 다음 페이지 시작점(_id)
   * @returns items와 nextCursor(없으면 null)
   */
  /**
   * 소유자 기준 커서 페이징(스텁)
   * @param _ownerUserId 소유 사용자 ID
   * @param _limit 페이지 크기(1~100)
   * @param _cursor 다음 페이지 커서(opaque)
   * @returns 항상 NotImplemented 에러를 throw
   * @throws {Error} NotImplemented
   */
  async listByOwner(_ownerUserId: number, _limit: number, _cursor?: string): Promise<{ items: Conversation[]; nextCursor?: string | null }> {
    throw new Error('NotImplemented: ConversationRepositoryMongo.listByOwner');
  }
}
