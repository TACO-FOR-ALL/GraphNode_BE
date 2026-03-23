import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';

/**
 * 최근 노트 조회 도구
 */
export class GetRecentNotesTool implements IAgentTool {
  readonly name = 'get_recent_notes';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_recent_notes',
      description: '사용자의 최근 수정된 노트를 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '가져올 노트의 수 (기본값: 5)' },
        },
      },
    },
  };

  /**
   * 최근 노트 조회 실행
   * @param userId 사용자 ID
   * @param args 제한 수
   * @param deps AgentServiceDeps
   * @returns JSON.stringify({ message: '최근 노트 ${notes.length}개를 가져왔습니다.', notes: notes.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt, })) })
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    // 노트 서비스 가져오기
    const { noteService } = deps;
    const limit = (args.limit as number) || 5;

    // 노트 가져오기
    const { items: notes } = await noteService.listNotes(userId, null, limit);
    const recent = notes
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    return JSON.stringify({
      message: `최근 ${recent.length}개의 노트입니다.`,
      notes: recent.map((n) => ({
        id: n.id,
        title: n.title,
        preview: n.content.slice(0, 200) + (n.content.length > 200 ? '...' : ''),
        updatedAt: n.updatedAt,
      })),
    });
  }
}
