import type { ConversationDto } from './conversation.js';
import type { MessageDto } from './message.js';
import type { NoteDto, FolderDto } from './note.js';

/**
 * 동기화 푸시 요청 DTO
 * @public
 * @property conversations 변경된 대화 목록 (선택)
 * @property messages 변경된 메시지 목록 (선택, conversationId 포함)
 * @property notes 변경된 노트 목록 (선택)
 * @property folders 변경된 폴더 목록 (선택)
 */
export interface SyncPushRequest {
  conversations?: ConversationDto[];
  messages?: (MessageDto & { conversationId: string })[];
  notes?: NoteDto[];
  folders?: FolderDto[];
}

/**
 * 동기화 풀 응답 DTO
 * @public
 * @property conversations 변경된 대화 목록
 * @property messages 변경된 메시지 목록
 * @property notes 변경된 노트 목록
 * @property folders 변경된 폴더 목록
 * @property serverTime 서버 현재 시각 (ISO 8601) - 다음 동기화 커서로 사용
 */
export interface SyncPullResponse {
  conversations: ConversationDto[];
  messages: MessageDto[];
  notes: NoteDto[];
  folders: FolderDto[];
  serverTime: string; // ISO 8601
}
