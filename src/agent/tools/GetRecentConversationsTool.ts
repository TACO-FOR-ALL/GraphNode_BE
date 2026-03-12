import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';

/**
 * 최근 대화 목록 조회 도구
 */
export class GetRecentConversationsTool implements IAgentTool {
  readonly name = 'get_recent_conversations';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_recent_conversations',
      description: '사용자의 최근 대화 목록을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '가져올 대화의 수 (기본값: 5)' },
        },
      },
    },
  };

  /**
   * 최근 대화 목록 조회 실행
   * @param userId 사용자 ID
   * @param args 제한 수
   * @param deps AgentServiceDeps
   * @returns JSON.stringify({ message: '최근 대화 ${conversations.length}개를 가져왔습니다.', conversations: conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, })) })
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { conversationService } = deps;
    const limit = (args.limit as number) || 5;

    // 대화 목록 가져오기
    const { items: conversations } = await conversationService.listConversations(userId, limit);

    return JSON.stringify({
      message: `최근 ${conversations.length}개의 대화입니다.`,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
      })),
    });
  }
}
