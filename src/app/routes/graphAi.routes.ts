import { Router } from 'express';

import { GraphAiController } from '../controllers/GraphAiController';
import { requireLogin } from '../middlewares/auth';
import { GraphGenerationService } from '../../core/services/GraphGenerationService';
import { bindSessionUser } from '../middlewares/session';
import { asyncHandler } from '../utils/asyncHandler';

export function createGraphAiRouter(graphGenerationService: GraphGenerationService): Router {
  const router = Router();
  const graphAiController = new GraphAiController(graphGenerationService);

  // [테스트용] POST /v1/graph-ai/test/generate-json
  // 공통 미들웨어 영향 안받음
  router.post(
    '/test/generate-json',
    asyncHandler(graphAiController.generateGraphTest.bind(graphAiController))
  );

  // 공통 미들웨어 적용: 세션 사용자 바인딩 및 로그인 요구
  router.use(bindSessionUser, requireLogin);

  // POST /v1/graph-ai/generate
  router.post('/generate', asyncHandler(graphAiController.generateGraph.bind(graphAiController)));

  return router;
}
