import { OpenAI } from 'openai';
import { AgentServiceDeps } from '../core/services/AgentService';
import type { CreditFeature } from '../core/types/persistence/credit.persistence';

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
 *
 * @property creditFeature 이 도구 호출에 부과할 크레딧 기능 키.
 *   설정된 경우 ToolRegistry.execute()가 호출 성공 후 creditService.deduct()를 실행합니다.
 *   현재는 모든 도구가 undefined(무과금)이며, 향후 고비용 Tool에만 선택적으로 지정합니다.
 */
export interface IAgentTool {
  /** OpenAI API에 전달할 도구 명세 */
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool;

  /** 도구의 고유 이름 */
  readonly name: string;

  /**
   * 이 도구 호출에 부과할 크레딧 기능 키 (선택적).
   * undefined이면 추가 과금 없음.
   */
  readonly creditFeature?: CreditFeature;

  /** 실제 실행 로직 */
  execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string>;
}
