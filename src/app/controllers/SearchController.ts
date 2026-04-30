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

  /**
   * Graph RAG 검색 결과를 반환합니다.
   *
   * @remarks
   * `q`를 임베딩 기반 seed 검색과 Neo4j 1-2 hop 확장 검색에 사용합니다.
   * 응답 노드는 `combinedScore` 내림차순으로 정렬되며, 식별을 위한 `title`과
   * `clusterName`을 함께 포함합니다.
   *
   * @route GET /v1/search/graph-rag?q={keyword}&limit={limit}
   */
  async graphRagSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { q, limit } = req.query;

      if (!q || typeof q !== 'string') {
        throw new ValidationError('Query parameter "q" is required.');
      }

      const parsedLimit = parseSearchLimit(limit);
      const result = await this.searchService.graphRagSearch(userId, q, parsedLimit);

      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

/**
 * Graph RAG 검색 limit 쿼리 파라미터를 검증하고 숫자로 변환합니다.
 *
 * @param value Express query에서 읽은 limit 값입니다.
 * @returns limit이 생략되면 undefined, 유효하면 숫자 limit을 반환합니다.
 * @throws {ValidationError} limit이 1-50 범위의 정수가 아니면 발생합니다.
 */
function parseSearchLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError('Query parameter "limit" must be a positive integer.');
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ValidationError('Query parameter "limit" must be an integer between 1 and 50.');
  }

  return limit;
}
