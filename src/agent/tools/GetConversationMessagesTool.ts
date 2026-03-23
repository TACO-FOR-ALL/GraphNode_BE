import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';

/**
 * 특정 대화의 메시지 목록 조회 도구
 */
export class GetConversationMessagesTool implements IAgentTool {
  readonly name = 'get_conversation_messages';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_conversation_messages',
      description: '특정 대화의 메시지 내용을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: '대화 ID' },
          limit: { type: 'number', description: '반환할 최대 메시지 수 (기본값: 20)' },
        },
        required: ['conversationId'],
      },
    },
  };

  /**
   * 특정 대화의 메시지 목록 조회 실행
   * @param userId 사용자 ID
   * @param args 대화 ID와 제한 수
   * @param deps AgentServiceDeps
   * @returns JSON.stringify({ message: `${messages.length}개의 메시지를 가져왔습니다.`, messages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt, })) })
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { conversationService, messageService } = deps;
    const conversationId = args.conversationId as string;
    const limit = (args.limit as number) || 20; // 기본값 20@

    try {
      // 대화 가져오기
      const conv = await conversationService.getConversation(conversationId, userId);
      const messageDocs = await messageService.findDocsByConversationId(conversationId);
      const messages = messageDocs.slice(0, limit);

      return JSON.stringify({
        message: '대화 내용입니다.',
        conversation: {
          id: conv.id,
          title: conv.title,
          messages: messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content.slice(0, 500) + (m.content.length > 500 ? '...' : ''),
          })),
        },
      });
    } catch {
      return JSON.stringify({ message: '대화를 찾을 수 없습니다.', conversation: null });
    }
  }
}
