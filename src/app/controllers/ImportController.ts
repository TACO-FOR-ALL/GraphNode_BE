/**
 * AI export archive import (BFF → File Service 프록시 + finalize).
 */
import type { Request, Response } from 'express';

import type { ImportArchiveService } from '../../core/services/ImportArchiveService';
import { getUserIdFromRequest } from '../utils/request';
import {
  fileAccessQuerySchema,
  importJobIdParamSchema,
  initImportUploadSchema,
} from '../../shared/dtos/import.schemas';

export class ImportController {
  constructor(private readonly importArchiveService: ImportArchiveService) {}

  listProviders = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const providers = await this.importArchiveService.listProviders(userId);
    res.json({ providers });
  };

  initImportUpload = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const body = initImportUploadSchema.parse(req.body);
    const result = await this.importArchiveService.initImportUpload(
      userId,
      body.provider,
      body.originalName,
      body.sizeBytes
    );
    res.status(201).json(result);
  };

  startImport = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const { jobId } = importJobIdParamSchema.parse(req.params);
    const result = await this.importArchiveService.startImport(userId, jobId);
    res.status(202).json(result);
  };

  getJob = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const { jobId } = importJobIdParamSchema.parse(req.params);
    const job = await this.importArchiveService.getJob(userId, jobId);
    res.json(job);
  };

  finalizeImport = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const { jobId } = importJobIdParamSchema.parse(req.params);
    const result = await this.importArchiveService.finalizeImport(userId, jobId);
    if (result.status === 'finalizing') {
      res.status(202).json(result);
      return;
    }
    res.status(200).json(result);
  };

  cancelJob = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const { jobId } = importJobIdParamSchema.parse(req.params);
    await this.importArchiveService.cancelJob(userId, jobId);
    res.status(204).send();
  };

  getFileAccessUrl = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const fileId = String(req.params.fileId);
    const { disposition } = fileAccessQuerySchema.parse(req.query);
    // File Service presign → S3 presigned GET URL (FE가 직접 S3 요청)
    const out = await this.importArchiveService.getFileAccessUrl(userId, fileId, { disposition });
    res.json(out);
  };
}
