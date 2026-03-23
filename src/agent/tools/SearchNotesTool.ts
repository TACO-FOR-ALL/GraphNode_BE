import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';

/**
 * 노트 검색 도구
 *
 */
export class SearchNotesTool implements IAgentTool {
  readonly name = 'search_notes';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '사용자의 노트 중에서 특정 키워드가 포함된 노트를 검색합니다.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '검색할 키워드' },
          limit: { type: 'number', description: '반환할 최대 결과 수 (기본값: 5)' },
        },
        required: ['keyword'],
      },
    },
  };

  /**
   * 노트 검색 실행
   * @param userId 사용자 ID
   * @param args 검색어와 제한 수
   * @param deps AgentServiceDeps
   * @returns JSON.stringify({ message: '검색 결과가 없습니다.', notes: [] })
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { noteService } = deps;
    const keyword = args.keyword as string;
    const limit = (args.limit as number) || 5;

    // 노트 조회
    const { items: allNotes } = await noteService.listNotes(userId, null, 10000);

    // 노트 필터링, 키워드 포함된 노트만 필터링
    const filtered = allNotes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(keyword.toLowerCase()) ||
          note.content.toLowerCase().includes(keyword.toLowerCase())
      )
      .slice(0, limit);

    if (filtered.length === 0) {
      return JSON.stringify({ message: '검색 결과가 없습니다.', notes: [] });
    }

    // 노트 반환
    return JSON.stringify({
      message: `${filtered.length}개의 노트를 찾았습니다.`,
      notes: filtered.map((n) => ({
        id: n.id,
        title: n.title,
        preview: n.content.slice(0, 200) + (n.content.length > 200 ? '...' : ''),
        updatedAt: n.updatedAt,
      })),
    });
  }
}
