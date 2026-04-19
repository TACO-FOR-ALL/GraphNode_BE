import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { AwsS3Adapter } from '../../infra/aws/AwsS3Adapter';
import { ValidationError } from '../../shared/errors/domain';

export interface FileAttachment {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * 모듈: FileController
 * 책임: 파일 관련 HTTP 요청을 처리한다.
 *
 * - S3에서 파일 조회 및 버퍼 응답 반환
 * - S3에 파일 업로드 처리
 */
export class FileController {
  private readonly s3Adapter: AwsS3Adapter;

  constructor(deps: { awsS3Adapter: AwsS3Adapter }) {
    // Adapter 직접 의존 (별도 서비스 계층 없음 - 요구사항)
    this.s3Adapter = deps.awsS3Adapter;
  }

  /**
   * 파일 다운로드/조회 핸들러
   * GET /api/v1/ai/files/:key
   * req.params[0] 에서 S3 key를 추출한다 (슬래시 포함 경로 지원).
   */
  async downloadFile(req: Request, res: Response): Promise<void> {
    const key = req.params.key || req.params[0];
    if (!key) throw new ValidationError('File key is required');
    await this.streamFileToResponse(key, res);
  }

  /**
   * 마운트 경로 기반 파일 다운로드 핸들러
   * GET /feedback-files/:name, GET /chat-files/:name, GET /sdk-files/:name 등
   *
   * req.baseUrl + req.path 로 S3 key를 복원한다.
   * 예) req.baseUrl="/feedback-files", req.path="/uuid-icon.png"
   *   → key = "feedback-files/uuid-icon.png"
   */
  async downloadFileByFullPath(req: Request, res: Response): Promise<void> {
    const key = (req.baseUrl + req.path).slice(1);
    if (!key) throw new ValidationError('File key is required');
    await this.streamFileToResponse(key, res);
  }

  /**
   * S3에서 파일을 받아 HTTP 응답으로 스트리밍하는 공통 로직.
   */
  private async streamFileToResponse(key: string, res: Response): Promise<void> {
    const file = await this.s3Adapter.downloadFile(key, { bucketType: 'file' });
    const filename = key.split('/').pop() || 'file';

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Type', file.contentType ?? 'application/octet-stream');
    if (file.contentLength) res.setHeader('Content-Length', file.contentLength);

    res.end(file.buffer);
  }

  /**
   * 파일 업로드 핸들러
   * POST /api/v1/ai/files
   */
  async uploadFiles(req: Request, res: Response) {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      throw new ValidationError('No files uploaded');
    }

    const attachments: FileAttachment[] = [];
    for (const file of files) {
      const ext = file.originalname.includes('.') ? '.' + file.originalname.split('.').pop() : '';
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const key = `sdk-files/${uuidv4()}-${date}${ext}`;
      
      // S3 File Bucket에 업로드
      await this.s3Adapter.upload(key, file.buffer, file.mimetype, { bucketType: 'file' });

      attachments.push({
        id: uuidv4(),
        type: file.mimetype.startsWith('image/') ? 'image' : 'file',
        url: key,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    }

    res.status(201).json({ attachments });
  }
}
