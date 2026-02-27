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
   */
  async downloadFile(req: Request, res: Response) {
    // req.params.key 에는 '/' 문자가 포함될 수 있으므로, 라우터에서 Wildcard 처리가 필요함 (*).
    const key = req.params.key || req.params[0];

    if (!key) {
      throw new ValidationError('File key is required');
    }

    try {
      const file = await this.s3Adapter.downloadFile(key, { bucketType: 'file' });
      const filename = key.split('/').pop() || 'file';

      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      if (file.contentType) {
        res.setHeader('Content-Type', file.contentType);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      if (file.contentLength) {
        res.setHeader('Content-Length', file.contentLength);
      }

      res.end(file.buffer);
    } catch (err) {
      throw err;
    }
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
      // url 부분은 key를 그대로 쓰고, chat-files와는 구분되는 'sdk-files' 등의 이름으로 처리
      const key = `sdk-files/${uuidv4()}-${file.originalname}`;
      
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
