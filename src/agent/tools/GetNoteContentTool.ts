import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';

/**
 * 특정 노트 내용 조회 도구
 */
export class GetNoteContentTool implements IAgentTool {
  readonly name = 'get_note_content';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_note_content',
      description: '특정 노트의 전체 내용을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: '노트 ID' },
        },
        required: ['noteId'],
      },
    },
  };

  /**
   * 노트 내용 조회 실행
   * @param userId 사용자 ID
   * @param args 노트 ID
   * @param deps AgentServiceDeps
   * @returns JSON.stringify({ message: '노트 내용입니다.', note: { id: note.id, title: note.title, content: note.content } })
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { noteService } = deps;
    const noteId = args.noteId as string;
    try {
      // 노트 조회
      const note = await noteService.getNote(userId, noteId);
      return JSON.stringify({
        message: '노트 내용입니다.',
        note: {
          id: note.id,
          title: note.title,
          content: note.content,
          updatedAt: note.updatedAt,
        },
      });
    } catch {
      return JSON.stringify({ message: '노트를 찾을 수 없습니다.', note: null });
    }
  }
}
