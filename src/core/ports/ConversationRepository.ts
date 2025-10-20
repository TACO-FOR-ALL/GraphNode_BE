/**
 * 모듈: ConversationRepository Port
 * 책임
 * - 대화 문서의 저장/조회/커서 페이징을 추상화한다(포트-어댑터 패턴의 포트).
 * 외부 의존
 * - 없음(프레임워크 비의존). infra(어댑터)가 본 인터페이스를 구현한다.
 * 공개 인터페이스
 * - ConversationRepository
 * 로깅 컨텍스트
 * - 리포지토리 구현체에서 logger를 사용하되, 본 포트는 순수 타입만 노출.
 */
import { Conversation } from '../domain/Conversation';
import type { Provider, Source } from '../../shared/dtos/ai';

/**
 * ConversationRepository Port
 * - 대화 문서의 저장/조회/커서 페이징을 정의한다.
 * - 구현은 infra 레이어(예: MongoDB)에서 제공한다.
 */
export interface ConversationRepository {
  /**
   * 신규 대화 생성(V2 메타 기반)
   * @description
   * - 프론트엔드가 정규화한 V2 DTO 형태의 메타데이터를 받아 대화를 영속화한다.
   * - 메시지는 별도 리포지토리에서 관리되며 여기서는 생성하지 않는다.
   * @param input 생성 메타데이터
   * @param input.id 내부 대화 식별자(UUID/ULID)
   * @param input.ownerUserId 소유 사용자 ID(정수)
   * @param input.provider AI 공급자 식별자
   * @param input.model 모델 문자열(벤더 명명 그대로)
   * @param input.title 제목(선택)
   * @param input.source 데이터 원천(선택)
   * @param input.createdAt RFC3339 UTC 생성 시각
   * @param input.updatedAt RFC3339 UTC 수정 시각
   * @param input.tags 태그 배열(선택)
   * @returns 생성된 Conversation 엔티티(도메인 모델)
   * @throws {Error} 저장 중 내부 오류(구현체에서 AppError로 매핑해 throw 권장)
   * @example
   * await repo.create({
   *   id: 'c_123', ownerUserId: 1, provider: 'openai', model: 'gpt-4o-mini',
   *   title: 'Project', source: 'api', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z'
   * });
   * @remarks
   * - 트랜잭션 경계는 구현체의 책임이다.
   */
  create(input: {
    id: string;
    ownerUserId: number;
    provider: Provider;
    model: string;
    title?: string | null;
    source?: Source;
    createdAt: string; // RFC3339
    updatedAt: string; // RFC3339
    tags?: string[];
  }): Promise<Conversation>;
  /**
   * ID로 단건 조회
   * @param id 대화 ID(UUID/ULID)
   * @returns Conversation 또는 null
   * @throws {Error} 조회 중 내부 오류(구현체에서 AppError로 매핑 권장)
   * @example
   * const conv = await repo.findById('c_123');
   */
  findById(id: string): Promise<Conversation | null>;
  /**
   * 소유자 기준으로 최신순 페이지를 조회한다.
   * @param ownerUserId 소유 사용자 ID
   * @param limit 반환 개수 상한(1~100)
   * @param cursor 다음 페이지 커서(opaque)
   * @returns 항목 목록과 nextCursor(없으면 null)
   * @throws {Error} 조회 중 내부 오류(구현체에서 AppError로 매핑 권장)
   * @example
   * const { items, nextCursor } = await repo.listByOwner(1, 20);
   */
  listByOwner(ownerUserId: number, limit: number, cursor?: string): Promise<{ items: Conversation[]; nextCursor?: string | null }>;
}
