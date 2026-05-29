import { Router } from 'express';
import type { NotionApiController } from '../controllers/NotionApiController';

/**
 * @description FE 노션 데이터 조회용 API 라우터
 */
export function createNotionApiRouter(controller: NotionApiController): Router {
  const router = Router();

  router.get('/pages', controller.getRootPages.bind(controller));
  router.get('/blocks/:blockId/children', controller.getBlockChildren.bind(controller));

  return router;
}
