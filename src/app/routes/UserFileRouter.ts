import { Router } from 'express';
import multer from 'multer';

import { UserFileService } from '../../core/services/UserFileService';
import { UserFileController } from '../controllers/UserFileController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';

/** 메모리 업로드 — 단일 파일 크기 상한 없음(인프라/메모리 한도는 별도). */
const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * 사용자 라이브러리 파일 라우터 팩토리.
 *
 * - `/v1` 에 마운트되는 전제로 경로는 `files`, `sidebar-items`, `files/:id/view-url` 등을 포함한다.
 * - `GET /files/:id` 보다 구체적인 경로(`content`, `view-url`)를 먼저 등록한다.
 */
export function createUserFileRouter(deps: { userFileService: UserFileService }) {
  const router = Router();
  const controller = new UserFileController(deps.userFileService);

  router.use(bindSessionUser, requireLogin);

  router.post('/files', upload.single('file'), asyncHandler(controller.upload.bind(controller)));
  router.get('/files', asyncHandler(controller.list.bind(controller)));
  router.get('/sidebar-items', asyncHandler(controller.sidebarItems.bind(controller)));
  router.get('/files/:id/content', asyncHandler(controller.downloadContent.bind(controller)));
  router.get('/files/:id/view-url', asyncHandler(controller.presignedViewUrl.bind(controller)));
  router.get('/files/:id/summary/preview', asyncHandler(controller.summaryPreview.bind(controller)));
  router.get('/files/:id/summary/full', asyncHandler(controller.summaryFull.bind(controller)));
  router.patch('/files/:id', asyncHandler(controller.patch.bind(controller)));
  router.get('/files/:id', asyncHandler(controller.getOne.bind(controller)));
  router.delete('/files/:id', asyncHandler(controller.remove.bind(controller)));

  return router;
}
