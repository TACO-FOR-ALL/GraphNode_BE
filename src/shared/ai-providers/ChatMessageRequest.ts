export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * FE-BE간 채팅 메시지 DTO
 * @param role 메시지 역할
 * @param content 메시지 내용
 */
export interface ChatMessageRequest {
  role: ChatRole;
  content: string;
}
