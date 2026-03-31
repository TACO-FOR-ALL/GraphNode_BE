import { Router } from 'express';
import { SearchController } from '../../app/controllers/SearchController';
import { createSearchRouter } from '../../app/routes/SearchRouter';
import { container } from '../container';

/**
 * 모듈: Search 컴포지션 (의존성 조립)
 * 책임: SearchService를 주입받아 SearchController를 생성하고, 라우팅을 설정한다.
 */
export function makeSearchRouter(): Router {
  const service = container.getSearchService();
  const controller = new SearchController(service);
  return createSearchRouter(controller);
}
