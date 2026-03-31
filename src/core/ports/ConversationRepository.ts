/**
 * 모듈: ConversationRepository Port (대화 저장소 인터페이스)
 *
 * 책임:
 * - 대화(Conversation) 데이터의 저장소(DB)에 접근하기 위한 공통 규약(Interface)을 정의합니다.
 * - 비즈니스 로직(Service)이 특정 DB 기술(MongoDB, MySQL 등)에 의존하지 않도록 분리하는 역할을 합니다.
 *
 * 개념: Port & Adapter 패턴 (Hexagonal Architecture)
 * - Port: 인터페이스 (이 파일) - "무엇을 할 것인가"를 정의
 * - Adapter: 구현체 (infra/repositories/ConversationRepositoryMongo.ts) - "어떻게 할 것인가"를 구현
 */
import type { ClientSession } from 'mongodb';

import type { ConversationDoc } from '../types/persistence/ai.persistence';

/**
 * ConversationRepository 인터페이스
 *
 * 대화 데이터의 CRUD(생성, 조회, 수정, 삭제) 기능을 정의합니다.
 * 모든 구현체는 이 인터페이스를 준수해야 합니다.
 *
 * **규칙**: Repository는 오직 Persistence Type(`*Doc`)만 다룹니다.
 * DTO 변환은 Service 계층에서 담당해야 합니다.
 */
export interface ConversationRepository {
  /**
   * 신규 대화를 생성(저장)합니다.
   *
   * @param doc 저장할 대화 문서 객체
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 저장된 대화 문서
   */
  create(doc: ConversationDoc, session?: ClientSession): Promise<ConversationDoc>;

  /**
   * 여러 대화를 한 번에 생성합니다 (Bulk Insert).
   *
   * @param docs 저장할 대화 문서 배열
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 저장된 대화 문서 배열
   */
  createMany(docs: ConversationDoc[], session?: ClientSession): Promise<ConversationDoc[]>;

  /**
   * ID로 대화를 조회합니다.
   *
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID (본인 확인용)
   * @returns 대화 문서 또는 null (없을 경우)
   */
  findById(
    id: string,
    ownerUserId: string,
    session?: ClientSession
  ): Promise<ConversationDoc | null>;

  /**
   * 특정 사용자의 모든 대화를 삭제합니다.
   *
   * @param ownerUserId 소유자 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제된 대화 수
   */
  deleteAll(ownerUserId: string, session?: ClientSession): Promise<number>;

  /**
   * 특정 사용자의 대화 목록을 조회합니다 (페이징 지원).
   *
   * @param ownerUserId 소유자 ID
   * @param limit 한 번에 가져올 개수
   * @param cursor 페이징 커서 (이전 페이지의 마지막 항목 기준)
   * @returns 대화 문서 목록과 다음 페이지 커서
   */
  listByOwner(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }>;

  /**
   * 대화 정보를 업데이트합니다.
   *
   * @param id 업데이트할 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 필드들 (일부만 전달 가능)
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 업데이트된 대화 문서 또는 null (대상을 찾지 못한 경우)
   */
  update(
    id: string,
    ownerUserId: string,
    updates: Partial<ConversationDoc>,
    session?: ClientSession
  ): Promise<ConversationDoc | null>;

  /**
   * 대화를 삭제합니다.
   *
   * @param id 삭제할 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제 성공 여부 (true: 삭제됨, false: 대상 없음)
   */
  delete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Soft Delete: deletedAt 필드를 현재 시각으로 설정합니다.
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   */
  softDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Hard Delete: 문서를 DB에서 완전히 삭제합니다.
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   */
  hardDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Restore: Soft Delete된 대화를 복구합니다. (deletedAt = null)
   *
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 복구 성공 여부
   */
  restore(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * 동기화용: 특정 시점 이후 변경된(삭제 포함) 대화를 조회합니다.
   * @param ownerUserId 소유자 ID
   * @param since 기준 시각
   */
  findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]>;

  /**
   * 휴지통 항목 조회: 삭제된 대화 목록을 조회합니다.
   * @param ownerUserId 소유자 ID
   * @param limit 가져올 개수
   * @param cursor 페이징 커서
   */
  listTrashByOwner(
    ownerUserId: string,
    limit: number,
    cursor?: string
   ): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }>;

  /**
   * 오래된 소프트 삭제된 대화들을 영구 삭제합니다 (자동 정리용).
   * @param expiredBefore 기준 시각 (이 시각 이전에 삭제된 항목들을 삭제)
   * @returns 삭제된 대화 수
   */
  hardDeleteExpired(expiredBefore: Date): Promise<number>;

  /**
   * 소프트 삭제된 지 오래되어 만료된 대화 목록을 조회합니다.
   * @param expiredBefore 기준 시각 (이 시각 이전 삭제건 대상)
   * @returns 만료된 대화 문서 배열
   */
  findExpiredConversations(expiredBefore: Date): Promise<ConversationDoc[]>;

  /**
   * 키워드를 사용하여 대화 제목을 검색합니다 (Full-Text Search).
   * 
   * @param ownerUserId 소유자 ID
   * @param query 검색 키워드
   * @param limit 최대 결과 수 (기본값: 20)
   * @returns 검색어와 매칭되는 대화 문서 배열 (score 내림차순 정렬)
   */
  searchByKeyword(ownerUserId: string, query: string, limit?: number): Promise<(ConversationDoc & { score?: number })[]>;

  /**
   * 여러 ID에 해당하는 대화 문서들을 한 번에 조회합니다.
   *
   * @param ids 대화 ID 배열
   * @param ownerUserId 소유자 ID
   * @returns 대화 문서 배열
   */
  findByIds(ids: string[], ownerUserId: string): Promise<ConversationDoc[]>;
}
