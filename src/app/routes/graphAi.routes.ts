import { Router } from 'express';

import { GraphAiController } from '../controllers/GraphAiController';
import { requireLogin } from '../middlewares/auth';
import { GraphGenerationService } from '../../core/services/GraphGenerationService';
import { bindSessionUser } from '../middlewares/session';
import { asyncHandler } from '../utils/asyncHandler';

export function createGraphAiRouter(graphGenerationService: GraphGenerationService): Router {
  const router = Router();
  const graphAiController = new GraphAiController(graphGenerationService);



  // 공통 미들웨어 적용: 세션 사용자 바인딩 및 로그인 요구
  router.use(bindSessionUser, requireLogin);

  // POST /v1/graph-ai/generate
  router.post('/generate', asyncHandler(graphAiController.generateGraph.bind(graphAiController)));

  // POST /v1/graph-ai/add-conversation/:conversationId
  router.post(
    '/add-conversation/:conversationId',
    asyncHandler(graphAiController.addConversationToGraph.bind(graphAiController))
  );

  // POST /v1/graph-ai/summary (생성 요청)
  router.post('/summary', asyncHandler(graphAiController.summarizeGraph.bind(graphAiController)));

  // GET /v1/graph-ai/summary (조회)
  router.get('/summary', asyncHandler(graphAiController.getSummary.bind(graphAiController)));

  // DELETE /v1/graph-ai/summary (요약 삭제)
  router.delete('/summary', asyncHandler(graphAiController.deleteSummary.bind(graphAiController)));

  // POST /v1/graph-ai/summary/restore (요약 복구)
  router.post('/summary/restore', asyncHandler(graphAiController.restoreSummary.bind(graphAiController)));

  // DELETE /v1/graph-ai (그래프 전체 삭제)
  router.delete('/', asyncHandler(graphAiController.deleteGraph.bind(graphAiController)));

  // POST /v1/graph-ai/restore (그래프 전체 복구)
  router.post('/restore', asyncHandler(graphAiController.restoreGraph.bind(graphAiController)));

  return router;
}
