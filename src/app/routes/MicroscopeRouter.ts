import { Router } from 'express';
import multer from 'multer';
import { MicroscopeController } from '../controllers/MicroscopeController';
import { requireLogin } from '../middlewares/auth';

const upload = multer({ storage: multer.memoryStorage() });

export function createMicroscopeRouter(controller: MicroscopeController): Router {
  const router = Router();

  // 모든 현존 워크스페이스 목록 조회
  router.get('/', requireLogin, controller.listWorkspaces);

  // 단일 워크스페이스 상세 조회
  router.get('/:groupId', requireLogin, controller.getWorkspace);

  // 워크스페이스 실제 그래프(Nodes & Edges) 조회 (FIXME TODO 수정 필요)
  router.get('/:groupId/graph', requireLogin, controller.getWorkspaceGraph);

  // 노드(Note/Conversation) 기반 워크스페이스 생성 및 Ingest
  router.post('/nodes/ingest', requireLogin, controller.ingestFromNode);

  // 워크스페이스 삭제
  router.delete('/:groupId', requireLogin, controller.deleteWorkspace);

  return router;
}
