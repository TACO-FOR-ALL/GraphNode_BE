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
   * ID로 대화를 조회합니다.
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID (본인 확인용)
   * @returns 대화 문서 또는 null (없을 경우)
   */
  findById(id: string, ownerUserId: string): Promise<ConversationDoc | null>;

  /**
   * 특정 사용자의 대화 목록을 조회합니다 (페이징 지원).
   * 
   * @param ownerUserId 소유자 ID
   * @param limit 한 번에 가져올 개수
   * @param cursor 페이징 커서 (이전 페이지의 마지막 항목 기준)
   * @returns 대화 문서 목록과 다음 페이지 커서
   */
  listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }>;

  /**
   * 대화 정보를 업데이트합니다.
   * 
   * @param id 업데이트할 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 필드들 (일부만 전달 가능)
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 업데이트된 대화 문서 또는 null (대상을 찾지 못한 경우)
   */
  update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>, session?: ClientSession): Promise<ConversationDoc | null>;

  /**
   * 대화를 삭제합니다.
   * 
   * @param id 삭제할 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session (선택) MongoDB 트랜잭션 세션
   * @returns 삭제 성공 여부 (true: 삭제됨, false: 대상 없음)
   */
  delete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;
}
