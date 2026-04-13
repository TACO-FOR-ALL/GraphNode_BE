import type { NoteDto } from './note.js';
import type { ConversationDto } from './conversation.js';

/**
 * 노트 및 AI 대화 통합 키워드 검색 응답 타입
 * @public
 */
export interface SearchNotesAndAIChatsResponse {
  /** 검색된 노트 목록 */
  notes: NoteDto[];
  /** 검색된 AI 대화(메시지 포함) 목록 */
  chatThreads: ConversationDto[];
}

/**
 * 노트 및 AI 대화 통합 키워드 검색 요청 파라미터
 * @public
 */
export interface SearchNotesAndAIChatsParams {
  /** 검색할 키워드 */
  q: string;
}
