import type { MessageDto } from './message.js';

/**
 * 대화(Conversation) DTO
 * @public
 * @property id 대화 ID (UUID)
 * @property title 대화 제목
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 * @property deletedAt 삭제 일시 (ISO 8601, null이면 활성)
 * @property messages 대화에 포함된 메시지 목록
 */
export interface ConversationDto {
  id: string;
  title: string;
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  deletedAt?: string | null; // ISO 8601
  messages: MessageDto[];
}

/**
 * 대화 생성 요청 DTO
 * @public
 * @property id 대화 ID (선택, 클라이언트 생성 시)
 * @property title 대화 제목
 * @property messages 초기 메시지 목록 (선택)
 */
export interface ConversationCreateDto {
  id: string;
  title: string;
  messages?: MessageDto[];
}

/**
 * 대화 수정 요청 DTO
 * @public
 * @property title 변경할 대화 제목 (선택)
 */
export interface ConversationUpdateDto {
  title?: string;
}

/**
 * 대화 일괄 생성 요청 DTO
 * @public
 * @property conversations 생성할 대화 목록
 */
export interface ConversationBulkCreateDto {
  conversations: ConversationCreateDto[];
}
