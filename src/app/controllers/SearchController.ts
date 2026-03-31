import { Request, Response } from 'express';
import { SearchService } from '../../core/services/SearchService';
import { logger } from '../../shared/utils/logger';

/**
 * 모듈: SearchController
 * 책임: 검색 요청을 처리하고 서비스로 전달합니다.
 */
export class SearchController {
  constructor(private searchService: SearchService) {}

  /**
   * 노트 및 AI 대화 통합 키워드 검색 핸들러
   * GET /v1/search?q={keyword}
   */
  async integratedSearchByKeyword(req: Request, res: Response) {
    const userId = (req as any).user?.id;
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Query parameter "q" is required.',
      });
    }

    const { notes, chatThreads } = await this.searchService.integratedSearchByKeyword(userId, q);

    return res.status(200).json({
      notes,
      chatThreads,
    });
  }
}
