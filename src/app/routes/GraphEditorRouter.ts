/**
 * 모듈: Graph Editor Router (팩토리)
 * 작성일: 2026-05-01
 *
 * 책임:
 * - /v1/graph/editor/* 하위 17개 엔드포인트를 정의합니다.
 * - 의존성 생성은 bootstrap에서 수행하고, 이 함수는 라우터만 조립합니다.
 */

import { Router } from 'express';

import type { GraphEditorService } from '../../core/services/GraphEditorService';
import { internalOrSession } from '../middlewares/internal';
import { asyncHandler } from '../utils/asyncHandler';
import { GraphEditorController } from '../controllers/GraphEditorController';

/**
 * Graph Editor 라우터 팩토리.
 * @param editorService GraphEditorService 인스턴스
 * @returns Express Router
 */
export function createGraphEditorRouter(editorService: GraphEditorService): Router {
  const router = Router();
  const ctrl = new GraphEditorController(editorService);

  router.use(internalOrSession);

  // Node
  router.post('/nodes', asyncHandler(ctrl.createNode.bind(ctrl)));
  router.patch('/nodes/:nodeId', asyncHandler(ctrl.updateNode.bind(ctrl)));
  router.delete('/nodes/:nodeId', asyncHandler(ctrl.deleteNode.bind(ctrl)));
  router.post('/nodes/:nodeId/move-cluster', asyncHandler(ctrl.moveNodeToCluster.bind(ctrl)));

  // Edge
  router.post('/edges', asyncHandler(ctrl.createEdge.bind(ctrl)));
  router.patch('/edges/:edgeId', asyncHandler(ctrl.updateEdge.bind(ctrl)));
  router.delete('/edges/:edgeId', asyncHandler(ctrl.deleteEdge.bind(ctrl)));

  // Cluster
  router.post('/clusters', asyncHandler(ctrl.createCluster.bind(ctrl)));
  router.patch('/clusters/:clusterId', asyncHandler(ctrl.updateCluster.bind(ctrl)));
  router.delete('/clusters/:clusterId', asyncHandler(ctrl.deleteCluster.bind(ctrl)));

  // Subcluster
  router.post('/subclusters', asyncHandler(ctrl.createSubcluster.bind(ctrl)));
  router.patch('/subclusters/:subclusterId', asyncHandler(ctrl.updateSubcluster.bind(ctrl)));
  router.delete('/subclusters/:subclusterId', asyncHandler(ctrl.deleteSubcluster.bind(ctrl)));
  router.post('/subclusters/:subclusterId/move-cluster', asyncHandler(ctrl.moveSubclusterToCluster.bind(ctrl)));
  router.post('/subclusters/:subclusterId/nodes', asyncHandler(ctrl.addNodeToSubcluster.bind(ctrl)));
  router.delete('/subclusters/:subclusterId/nodes/:nodeId', asyncHandler(ctrl.removeNodeFromSubcluster.bind(ctrl)));

  // Batch
  router.post('/transactions', asyncHandler(ctrl.executeBatch.bind(ctrl)));

  return router;
}
