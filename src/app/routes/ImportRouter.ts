/**
 * AI export import 라우트 (FE 노출, /v1).
 *
 * ZIP 업로드: presigned PUT (init → S3 → start). multipart POST /imports 는 제거됨.
 */
import { Router } from 'express';

import { ImportController } from '../controllers/ImportController';
import { asyncHandler } from '../utils/asyncHandler';
import { internalOrSession } from '../middlewares/internal';
import type { ImportArchiveService } from '../../core/services/ImportArchiveService';

export function createImportRouter(deps: { importArchiveService: ImportArchiveService }) {
  const router = Router();
  const controller = new ImportController(deps.importArchiveService);

  // /v1 에 마운트되므로 router.use(requireLogin) 금지 — 다른 /v1/* 라우트까지 401 발생
  const withAuth = [internalOrSession];

  router.get('/import-providers', ...withAuth, asyncHandler(controller.listProviders));
  router.post('/imports/init', ...withAuth, asyncHandler(controller.initImportUpload));
  router.post('/imports/:jobId/start', ...withAuth, asyncHandler(controller.startImport));
  router.get('/imports/:jobId', ...withAuth, asyncHandler(controller.getJob));
  router.post('/imports/:jobId/finalize', ...withAuth, asyncHandler(controller.finalizeImport));
  router.delete('/imports/:jobId', ...withAuth, asyncHandler(controller.cancelJob));
  router.get('/files/:fileId/access-url', ...withAuth, asyncHandler(controller.getFileAccessUrl));

  return router;
}
