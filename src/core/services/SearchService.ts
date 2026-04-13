import { logger } from '../../shared/utils/logger';
import { Note } from '../../shared/dtos/note';
import { ChatThread } from '../../shared/dtos/ai';

/**
 * 모듈: SearchService (통합 검색 서비스)
 * 책임: 노트 및 AI 대화 전반에 걸친 통합 키워드 검색을 수행합니다.
 *
 * @remarks
 * [개편 작업 중 — 임시 비활성화]
 * 기존 MongoDB $text 역색인 기반 검색이 제거되었습니다.
 * 추후 Atlas Search 또는 별도 검색 엔진 기반으로 재구현 예정입니다.
 * 현재 모든 검색 요청에 대해 빈 결과를 반환합니다.
 */
export class SearchService {
  /**
   * 통합 키워드 검색을 수행합니다.
   *
   * @param userId 검색을 수행하는 사용자의 고유 ID
   * @param keyword 검색할 키워드
   * @returns 빈 검색 결과 (notes: [], chatThreads: [])
   *
   * @remarks
   * 현재 검색 기능은 개편 작업 중으로 임시 비활성화되어 있습니다.
   * $text 역색인 기반 구현이 제거되었으며, 새로운 검색 엔진 연동 후 복구됩니다.
   */
  async integratedSearchByKeyword(
    userId: string,
    keyword: string
  ): Promise<{ notes: Note[]; chatThreads: ChatThread[] }> {
    logger.warn(
      { userId, keyword },
      '[SearchService] 통합 검색 기능은 현재 개편 작업 중으로 임시 비활성화되어 있습니다. 빈 결과를 반환합니다.'
    );
    return { notes: [], chatThreads: [] };
  }
}
