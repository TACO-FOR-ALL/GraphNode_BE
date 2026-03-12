import { OpenAI } from 'openai';
import { IAgentTool } from './types';
import { AgentServiceDeps } from '../core/services/AgentService';
import { SearchNotesTool } from './tools/SearchNotesTool';
import { GetRecentNotesTool } from './tools/GetRecentNotesTool';
import { GetNoteContentTool } from './tools/GetNoteContentTool';
import { SearchConversationsTool } from './tools/SearchConversationsTool';
import { GetRecentConversationsTool } from './tools/GetRecentConversationsTool';
import { GetConversationMessagesTool } from './tools/GetConversationMessagesTool';
import { GetGraphSummaryTool } from './tools/GetGraphSummaryTool';

/**
 * Agent Tool Registry
 *
 * Agent Tool 등록 및 실행 관리
 */
export class ToolRegistry {
  /**
   * Tool 저장소
   *
   * Tool 이름(key) : Tool(value)
   */
  private tools = new Map<string, IAgentTool>();

  /**
   * 생성자
   *
   * @constructor
   */
  constructor() {
    this.register(new SearchNotesTool());
    this.register(new GetRecentNotesTool());
    this.register(new GetNoteContentTool());
    this.register(new SearchConversationsTool());
    this.register(new GetRecentConversationsTool());
    this.register(new GetConversationMessagesTool());
    this.register(new GetGraphSummaryTool());
  }

  /** 도구 등록
   * @param tool 등록할 도구
   */
  register(tool: IAgentTool): void {
    this.tools.set(tool.name, tool);
  }

  /** 모든 도구 명세 가져오기 (OpenAI 전달용)
   * 구현되어 있는 Tool의 명세를 가져옵니다.
   * @returns OpenAI.Chat.Completions.ChatCompletionTool[]
   */
  getDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** 도구 실행
   * @param name 도구 이름
   * @param userId 사용자 ID
   * @param args 도구 인자
   * @param deps AgentServiceDeps
   * @param openai OpenAI
   * @returns Promise<string>
   */
  async execute(
    name: string,
    userId: string,
    args: any,
    deps: AgentServiceDeps,
    openai: OpenAI
  ): Promise<string> {
    // Tool 찾기
    const tool = this.tools.get(name);

    // Tool이 없으면 에러 반환
    if (!tool) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    // Tool 실행
    try {
      return await tool.execute(userId, args, deps, openai);
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
}
