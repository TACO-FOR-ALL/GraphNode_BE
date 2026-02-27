import { Router } from 'express';
import multer from 'multer';
import { MicroscopeController } from '../controllers/MicroscopeController';
import { requireLogin } from '../middlewares/auth';

const upload = multer({ storage: multer.memoryStorage() });

export function createMicroscopeRouter(controller: MicroscopeController): Router {
  const router = Router();

  // 모든 현존 워크스페이스 목록 조회
  router.get('/', requireLogin, controller.listWorkspaces);

  // 워크스페이스 생성 및 문서 업로드
  router.post('/', requireLogin, upload.array('files'), controller.createWorkspaceWithDocuments);

  // 단일 워크스페이스 상세 조회
  router.get('/:groupId', requireLogin, controller.getWorkspace);

  // 워크스페이스 실제 그래프(Nodes & Edges) 조회 (FIXME TODO 수정 필요)
  router.get('/:groupId/graph', requireLogin, controller.getWorkspaceGraph);

  // 기존 워크스페이스에 문서 추가 업로드
  router.post('/:groupId/documents', requireLogin, upload.array('files'), controller.addDocumentsToWorkspace);

  // 워크스페이스 삭제
  router.delete('/:groupId', requireLogin, controller.deleteWorkspace);

  return router;
}
