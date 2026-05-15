import type { Request, Response, NextFunction } from 'express';

import { ChatExportService } from '../../core/services/ChatExportService';
import { getUserIdFromRequest } from '../utils/request';
import { loadEnv } from '../../config/env';
import type { ChatExportStatusHttpDto } from '../../shared/dtos/chat-export';

/**
 * 채팅보내기 HTTP 컨트롤러 — 요청 검증·응답 직렬화만 담당합니다.
 */
export class ChatExportController {
  constructor(private readonly chatExportService: ChatExportService) {}

  /**
   * POST /conversations/:conversationId/exports
   */
  async startConversationExport(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const conversationId = req.params.conversationId!;
    const dto = await this.chatExportService.startExport(userId, conversationId);
    res.status(202).json(dto);
  }

  /**
   * POST /all
   */
  async startAllExports(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const dto = await this.chatExportService.startExportAll(userId);
    res.status(202).json(dto);
  }

  /**
   * GET /:jobId
   */
  async getStatus(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const jobId = req.params.jobId!;
    const status = await this.chatExportService.getExportStatus(userId, jobId);

    const response: ChatExportStatusHttpDto = { ...status };
    if (status.status === 'DONE') {
      response.downloadUrl = this.buildDownloadUrl(req, jobId);
    }

    res.status(200).json(response);
  }

  /**
   * GET /:jobId/download
   */
  async download(req: Request, res: Response, _next: NextFunction) {
    const userId = getUserIdFromRequest(req)!;
    const jobId = req.params.jobId!;
    const file = await this.chatExportService.downloadExportFile(userId, jobId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`
    );
    res.type(file.contentType ?? 'application/zip');
    if (file.contentLength != null) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    res.status(200).send(file.buffer);
  }

  /**
   * @description 완료된보내기 파일의 절대 다운로드 URL을 조립합니다.
   */
  private buildDownloadUrl(req: Request, jobId: string): string {
    const env = loadEnv();
    const configured = env.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
    const base = configured || `${req.protocol}://${req.get('host')}`;
    return `${base}/v1/exports/${jobId}/download`;
  }
}
