/**
 * 모듈: MessageRepository Port (메시지 저장소 인터페이스)
 *
 * 책임:
 * - 메시지(Message) 데이터의 저장소(DB) 접근 규약을 정의합니다.
 * - ConversationRepository와 마찬가지로 DB 기술 의존성을 제거하는 역할을 합니다.
 */
import type { ClientSession } from 'mongodb';

import type { MessageDoc } from '../types/persistence/ai.persistence';

/**
 * MessageRepository 인터페이스
 *
 * 메시지 데이터의 CRUD 기능을 정의합니다.
 *
 * **규칙**: Repository는 오직 Persistence Type(`*Doc`)만 다룹니다.
 */
export interface MessageRepository {
  /**
   * 단일 메시지를 생성(저장)합니다.
   *
   * @param doc 저장할 메시지 문서
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 저장된 메시지 문서
   */
  create(doc: MessageDoc, session?: ClientSession): Promise<MessageDoc>;

  /**
   * 여러 메시지를 한 번에 생성합니다 (Bulk Insert).
   *
   * @param docs 저장할 메시지 문서 배열
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 저장된 메시지 문서 배열
   */
  createMany(docs: MessageDoc[], session?: ClientSession): Promise<MessageDoc[]>;

  /**
   * 메시지 ID로 조회합니다.
   */
  findById(id: string): Promise<MessageDoc | null>;

  /**
   * 특정 대화방에 속한 모든 메시지를 조회합니다.
   *
   * @param conversationId 대화방 ID
   * @returns 해당 대화방의 모든 메시지 문서 배열
   */
  findAllByConversationId(conversationId: string): Promise<MessageDoc[]>;

  /**
   * 특정 사용자의 모든 메시지를 삭제합니다.
   *
   * @param ownerUserId 소유자 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제된 메시지 수
   */
  deleteAllByUserId(ownerUserId: string, session?: ClientSession): Promise<number>;

  /**
   * 메시지 정보를 업데이트합니다.
   *
   * @param id 업데이트할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID (검증용)
   * @param updates 업데이트할 필드들
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 업데이트된 메시지 문서 또는 null
   */
  update(
    id: string,
    conversationId: string,
    updates: Partial<MessageDoc>,
    session?: ClientSession
  ): Promise<MessageDoc | null>;

  /**
   * 메시지를 삭제합니다.
   *
   * @param id 삭제할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  delete(id: string, conversationId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Soft Delete: deletedAt 필드를 현재 시각으로 설정합니다.
   *
   * @param id 삭제할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제(업데이트) 성공 여부
   */
  softDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Hard Delete: 문서를 DB에서 완전히 삭제합니다.
   *
   * @param id 삭제할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  hardDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Restore: Soft Delete된 메시지를 복구합니다. (deletedAt = null)
   *
   * @param id 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 복구 성공 여부
   */
  restore(id: string, conversationId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Restore: 특정 대화방의 모든 메시지를 복구합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 복구된 메시지 개수
   */
  restoreAllByConversationId(conversationId: string, session?: ClientSession): Promise<number>;

  /**
   * 동기화용: 특정 시점 이후 변경된(삭제 포함) 메시지를 조회합니다.
   *
   * @param ownerUserId 소유자 ID
   * @param since 기준 시각
   * @returns 변경된 메시지 문서 목록
   */
  findModifiedSince(ownerUserId: string, since: Date): Promise<MessageDoc[]>;

  /**
   * 특정 대화방의 모든 메시지를 Soft Delete합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제(업데이트)된 메시지 개수
   */
  softDeleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number>;

  /**
   * 특정 대화방의 모든 메시지를 Hard Delete합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제된 메시지 개수
   */
  hardDeleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number>;

  /**
   * 특정 대화방에 속한 모든 메시지를 삭제합니다.
   * (대화방 삭제 시 함께 호출됨)
   *
   * @param conversationId 대화방 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제된 메시지 개수
   */
  deleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number>;
}
