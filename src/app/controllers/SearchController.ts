import { Request, Response, NextFunction } from 'express';
import { SearchService } from '../../core/services/SearchService';
import { ValidationError } from '../../shared/errors/domain';
import { getUserIdFromRequest } from '../utils/request';
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
  async integratedSearchByKeyword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        throw new ValidationError('Query parameter "q" is required.');
      }

      const { notes, chatThreads } = await this.searchService.integratedSearchByKeyword(userId, q);

      return res.status(200).json({ notes, chatThreads });
    } catch (err) {
      next(err);
    }
  }
}
