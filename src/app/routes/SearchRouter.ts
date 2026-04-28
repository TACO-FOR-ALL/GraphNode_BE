import { Router } from 'express';
import { SearchController } from '../controllers/SearchController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';

/**
 * 모듈: SearchRouter
 * 책임: 글로벌 검색 관련 API 경로를 정의합니다.
 */
export function createSearchRouter(controller: SearchController): Router {
  const router = Router();

  // 인증 미들웨어 적용
  router.use(bindSessionUser, requireLogin);

  /**
   * @route GET /v1/search
   * @description 글로벌 키워드 검색 (노트 및 대화)
   */
  router.get('/graph-rag', asyncHandler(controller.graphRagSearch.bind(controller)));
  router.get('/', asyncHandler(controller.integratedSearchByKeyword.bind(controller)));

  return router;
}
