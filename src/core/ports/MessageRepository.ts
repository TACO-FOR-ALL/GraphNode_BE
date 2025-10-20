/**
 * 모듈: MessageRepository Port
 * 책임
 * - 메시지 생성 및 대화별 페이징 조회 계약을 정의한다.
 * 외부 의존: 없음(프레임워크 비의존). infra 구현체가 연결된다.
 */
import { Message } from '../domain/Message';
import type { MessageRole, ContentBlock } from '../../shared/dtos/ai';

/**
 * MessageRepository Port
 * - 메시지 생성 및 대화별 페이징 조회 계약을 정의한다.
 */
export interface MessageRepository {
  /**
   * 메시지 생성(V2)
   * @description
   * - content blocks 기반. 문자열 본문은 {type:'text'}로 정규화하여 전달.
   * @param input 생성 입력
   * @param input.id 메시지 ID(UUID/ULID)
   * @param input.conversationId 소속 대화 ID
   * @param input.role 메시지 역할
   * @param input.content 컨텐츠 블록 배열
   * @param input.createdAt RFC3339 UTC 생성 시각
   * @param input.updatedAt RFC3339 UTC 수정 시각
   * @returns 생성된 Message 엔티티(도메인 모델)
   * @throws {Error} 저장 중 내부 오류(구현체에서 AppError 매핑 권장)
   * @example
   * await repo.create({ id:'m_1', conversationId:'c_1', role:'user', content:[{type:'text', text:'hi'}], createdAt:'...', updatedAt:'...' });
   */
  create(input: {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: ContentBlock[];
    createdAt: string; // RFC3339
    updatedAt: string; // RFC3339
  }): Promise<Message>;
  /**
   * 대화별 메시지 목록 페이징 조회
   * @param conversationId 대화 ID
   * @param limit 페이지 크기(1~100)
   * @param cursor 다음 페이지 커서(opaque)
   * @returns 항목 목록과 nextCursor(없으면 null)
   * @throws {Error} 조회 중 내부 오류(구현체에서 AppError 매핑 권장)
   * @example
   * const { items, nextCursor } = await repo.listByConversation('c_1', 50);
   */
  listByConversation(conversationId: string, limit: number, cursor?: string): Promise<{ items: Message[]; nextCursor?: string | null }>;
}
