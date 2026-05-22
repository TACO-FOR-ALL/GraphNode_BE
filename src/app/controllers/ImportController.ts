/**
 * AI export archive import (BFF → File Service 프록시 + finalize).
 */
import type { Request, Response } from 'express';

import type { ImportArchiveService } from '../../core/services/ImportArchiveService';
import { getUserIdFromRequest } from '../utils/request';
import { ValidationError } from '../../shared/errors/domain';
import {
  createImportSchema,
  fileAccessQuerySchema,
  importJobIdParamSchema,
} from '../../shared/dtos/import.schemas';

export class ImportController {
  constructor(private readonly importArchiveService: ImportArchiveService) {}

  listProviders = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const providers = await this.importArchiveService.listProviders(userId);
    res.json({ providers });
  };

  createImport = async (req: Request, res: Response): Promise<void> => {
    const userId = getUserIdFromRequest(req)!;
    const { provider } = createImportSchema.parse(req.body);
    const file = req.file;
    if (!file?.buffer?.length) {
      throw new ValidationError('ZIP file is required');
    }

    const result = await this.importArchiveService.createImport(
      userId,
      provider,
      file.buffer,
      file.originalname || 'export.zip'
    );
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
    res.status(201).json(result);
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
    const out = await this.importArchiveService.getFileAccessUrl(userId, fileId, { disposition });
    res.json(out);
  };
}
