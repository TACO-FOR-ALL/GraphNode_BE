/**
 * AI export import 라우트 (FE 노출, /v1).
 *
 * ZIP 업로드: presigned PUT (init → S3 → start). multipart POST /imports 는 제거됨.
 */
import { Router } from 'express';

import { ImportController } from '../controllers/ImportController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import type { ImportArchiveService } from '../../core/services/ImportArchiveService';

export function createImportRouter(deps: { importArchiveService: ImportArchiveService }) {
  const router = Router();
  const controller = new ImportController(deps.importArchiveService);

  router.use(bindSessionUser, requireLogin);

  router.get('/import-providers', asyncHandler(controller.listProviders));
  router.post('/imports/init', asyncHandler(controller.initImportUpload));
  router.post('/imports/:jobId/start', asyncHandler(controller.startImport));
  router.get('/imports/:jobId', asyncHandler(controller.getJob));
  router.post('/imports/:jobId/finalize', asyncHandler(controller.finalizeImport));
  router.delete('/imports/:jobId', asyncHandler(controller.cancelJob));
  router.get('/files/:fileId/access-url', asyncHandler(controller.getFileAccessUrl));

  return router;
}
