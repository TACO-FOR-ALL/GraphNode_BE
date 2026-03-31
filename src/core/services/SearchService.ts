import { logger } from '../../shared/utils/logger';
import { NoteService } from './NoteService';
import { ChatManagementService } from './ChatManagementService';
import { Note } from '../../shared/dtos/note';
import { ChatThread } from '../../shared/dtos/ai';

/**
 * 모듈: SearchService (통합 검색 서비스)
 * 책임: 노트 및 AI 대화(대화방, 메시지) 전반에 걸쳐 통합된 키워드 검색을 수행합니다.
 */
export class SearchService {
  constructor(
    private noteService: NoteService,
    private chatManagementService: ChatManagementService
  ) {}

  /**
   * 노트와 AI 대화(대화방 제목 및 메시지 내용)에서 통합 키워드 검색을 수행합니다.
   *
   * @param userId 검색을 수행하는 사용자의 고유 ID
   * @param keyword 검색할 키워드
   * @returns 통합 검색 결과 (노트 DTO 배열 및 대화 스레드 DTO 배열)
   */
  async integratedSearchByKeyword(
    userId: string,
    keyword: string
  ): Promise<{ notes: Note[]; chatThreads: ChatThread[] }> {
    logger.info({ userId, keyword }, 'Integrated keyword search triggered');

    // 1 & 2. 노트 검색 및 AI 대화 검색을 병렬로 수행합니다.
    const [notes, chatThreads] = await Promise.all([
      this.noteService.searchNotesByKeyword(userId, keyword),
      this.chatManagementService.searchChatThreadsByKeyword(userId, keyword),
    ]);

    return {
      notes,
      chatThreads,
    };
  }
}
