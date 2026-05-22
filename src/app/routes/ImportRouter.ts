/**
 * AI export import 라우트 (FE 노출, /v1).
 */
import { Router } from 'express';
import multer from 'multer';

import { ImportController } from '../controllers/ImportController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import type { ImportArchiveService } from '../../core/services/ImportArchiveService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5_368_709_120 },
});

export function createImportRouter(deps: { importArchiveService: ImportArchiveService }) {
  const router = Router();
  const controller = new ImportController(deps.importArchiveService);

  router.use(bindSessionUser, requireLogin);

  router.get('/import-providers', asyncHandler(controller.listProviders));
  router.post('/imports', upload.single('file'), asyncHandler(controller.createImport));
  router.get('/imports/:jobId', asyncHandler(controller.getJob));
  router.post('/imports/:jobId/finalize', asyncHandler(controller.finalizeImport));
  router.delete('/imports/:jobId', asyncHandler(controller.cancelJob));
  router.get('/files/:fileId/access-url', asyncHandler(controller.getFileAccessUrl));

  return router;
}
