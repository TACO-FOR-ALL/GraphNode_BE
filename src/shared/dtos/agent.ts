/**
 * Agent 관련 DTO 및 인터페이스
 * @public
 */

/** 채팅 모드 */
export type AgentMode = 'chat' | 'summary' | 'note' | 'irrelevant';

/** 모드 힌트 (클라이언트에서 전달) */
export type AgentModeHint = 'summary' | 'note' | 'auto';

/**
 * Chat 스트림 요청 바디
 * @property userMessage 사용자 메시지
 * @property contextText (선택) 컨텍스트 텍스트
 * @property modeHint (선택) 에이전트 채팅 모드 힌트
 */
export interface ChatStreamRequestBody {
  userMessage: string;
  contextText?: string;
  modeHint?: AgentModeHint;
}
