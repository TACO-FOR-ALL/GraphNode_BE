import type { Request, Response, NextFunction } from 'express';

import { ChatExportService } from '../../core/services/ChatExportService';
import { getUserIdFromRequest } from '../utils/request';

/**
 * 채팅 내보내기 HTTP 컨트롤러 — 요청 검증·응답 직렬화만 담당합니다.
 */
export class ChatExportController {
  constructor(private readonly chatExportService: ChatExportService) {}

  /**
   * POST /conversations/:conversationId/exports
   */
  async startExport(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const conversationId = req.params.conversationId!;
    const dto = await this.chatExportService.startExport(userId, conversationId);
    res.status(202).json(dto);
  }

  /**
   * GET /chat-exports/:jobId
   */
  async getStatus(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const jobId = req.params.jobId!;
    const dto = await this.chatExportService.getExportStatus(userId, jobId);
    res.status(200).json(dto);
  }

  /**
   * GET /chat-exports/:jobId/download
   */
  async download(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const jobId = req.params.jobId!;
    const file = await this.chatExportService.downloadExportFile(userId, jobId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`
    );
    res.type(file.contentType ?? 'application/json; charset=utf-8');
    if (file.contentLength != null) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    res.status(200).send(file.buffer);
  }
}
