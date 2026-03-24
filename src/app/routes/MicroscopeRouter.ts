import { Router } from 'express';
import multer from 'multer';
import { MicroscopeController } from '../controllers/MicroscopeController';
import { internalOrSession } from '../middlewares/internal';

const upload = multer({ storage: multer.memoryStorage() });

export function createMicroscopeRouter(controller: MicroscopeController): Router {
  const router = Router();

  // 공통 미들웨어 적용: 내부 토큰 또는 세션 사용자 검증
  router.use(internalOrSession);

  // 모든 현존 워크스페이스 목록 조회
  router.get('/', controller.listWorkspaces);

  // 단일 워크스페이스 상세 조회
  router.get('/:groupId', controller.getWorkspace);

  // 워크스페이스 실제 그래프(Nodes & Edges) 조회 
  router.get('/:groupId/graph', controller.getWorkspaceGraph);

  // (신규) 노드 ID 기반 최신 Microscope 그래프 조회
  router.get('/nodes/:nodeId/latest-graph', controller.getLatestGraphByNodeId);

  // 노드(Note/Conversation) 기반 워크스페이스 생성 및 Ingest
  router.post('/nodes/ingest', controller.ingestFromNode);

  // 워크스페이스 삭제
  router.delete('/:groupId', controller.deleteWorkspace);

  return router;
}
