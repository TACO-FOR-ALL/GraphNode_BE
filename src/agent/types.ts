import { OpenAI } from 'openai';
import { AgentServiceDeps } from '../core/services/AgentService';

/** 에이전트 채팅 모드 */
export type AgentMode = 'chat' | 'summary' | 'note' | 'irrelevant';

/** 모드 힌트 (클라이언트에서 전달) */
export type AgentModeHint = 'summary' | 'note' | 'auto';

/**
 * Chat 스트림 요청 바디
 */
export interface ChatStreamRequestBody {
  userMessage: string;
  contextText?: string;
  modeHint?: AgentModeHint;
}

/**
 * 에이전트 도구 인터페이스
 */
export interface IAgentTool {
  /** OpenAI API에 전달할 도구 명세 */
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool;
  
  /** 도구의 고유 이름 */
  readonly name: string;

  /** 실제 실행 로직 */
  execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string>;
}
