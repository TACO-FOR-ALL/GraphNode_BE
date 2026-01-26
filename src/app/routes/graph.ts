/**
 * 모듈: Graph Routes (팩토리)
 * 책임: 주입된 서비스로 라우터를 생성한다. 의존성 생성은 bootstrap에서 수행.
 */

import { Router } from 'express';

import type { GraphEmbeddingService } from '../../core/services/GraphEmbeddingService';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { GraphController } from '../controllers/graph';

/**
 * 라우터 팩토리 함수
 * @param graphEmbeddingService - 그래프 관련 서비스 인스턴스
 * @returns 라우터 객체
 */
export function createGraphRouter(graphEmbeddingService: GraphEmbeddingService) {
  const router = Router();
  const graphController = new GraphController(graphEmbeddingService);

  // 공통 미들웨어 적용: 세션 사용자 바인딩 및 로그인 요구
  router.use(bindSessionUser, requireLogin);

  // Node routes
  router.post('/nodes', asyncHandler(graphController.createNode.bind(graphController)));
  router.get('/nodes', asyncHandler(graphController.listNodes.bind(graphController)));
  router.get('/nodes/:nodeId', asyncHandler(graphController.getNode.bind(graphController)));
  router.patch('/nodes/:nodeId', asyncHandler(graphController.updateNode.bind(graphController)));
  router.delete('/nodes/:nodeId', asyncHandler(graphController.deleteNode.bind(graphController)));
  router.delete(
    '/nodes/:nodeId/cascade',
    asyncHandler(graphController.deleteNodeCascade.bind(graphController))
  );

  // Edge routes
  router.post('/edges', asyncHandler(graphController.createEdge.bind(graphController)));
  router.get('/edges', asyncHandler(graphController.listEdges.bind(graphController)));
  router.delete('/edges/:edgeId', asyncHandler(graphController.deleteEdge.bind(graphController)));

  // Cluster routes
  router.post('/clusters', asyncHandler(graphController.createCluster.bind(graphController)));
  router.get('/clusters', asyncHandler(graphController.listClusters.bind(graphController)));
  router.get(
    '/clusters/:clusterId',
    asyncHandler(graphController.getCluster.bind(graphController))
  );
  router.delete(
    '/clusters/:clusterId',
    asyncHandler(graphController.deleteCluster.bind(graphController))
  );
  router.delete(
    '/clusters/:clusterId/cascade',
    asyncHandler(graphController.deleteClusterCascade.bind(graphController))
  );

  // Stats routes
  router.get('/stats', asyncHandler(graphController.getStats.bind(graphController)));

  // Snapshot routes
  router.get('/snapshot', asyncHandler(graphController.getSnapshot.bind(graphController)));
  router.post('/snapshot', asyncHandler(graphController.saveSnapshot.bind(graphController)));

  return router;
}
