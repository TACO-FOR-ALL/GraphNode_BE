import { Router } from 'express';
import multer from 'multer';

import { UserFileService } from '../../core/services/UserFileService';
import { UserFileController } from '../controllers/UserFileController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';

/** 메모리 업로드 한도(바이트). 초과 시 multer가 413 계열로 거절한다. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

/**
 * 사용자 라이브러리 파일 라우터 팩토리.
 *
 * - `/v1` 에 마운트되는 전제로 경로는 `files`, `sidebar-items` 만 포함한다.
 * - `GET /files/:id` 가 `GET /files` 보다 뒤에 오면 안 되므로, 구체적인 경로(`content`)를 먼저 등록한다.
 */
export function createUserFileRouter(deps: { userFileService: UserFileService }) {
  const router = Router();
  const controller = new UserFileController(deps.userFileService);

  router.use(bindSessionUser, requireLogin);

  router.post('/files', upload.single('file'), asyncHandler(controller.upload.bind(controller)));
  router.get('/files', asyncHandler(controller.list.bind(controller)));
  router.get('/sidebar-items', asyncHandler(controller.sidebarItems.bind(controller)));
  router.get('/files/:id/content', asyncHandler(controller.downloadContent.bind(controller)));
  router.get('/files/:id', asyncHandler(controller.getOne.bind(controller)));
  router.delete('/files/:id', asyncHandler(controller.remove.bind(controller)));

  return router;
}
