import { Request, Response } from 'express';

import { UserFileService } from '../../core/services/UserFileService';
import { getUserIdFromRequest } from '../utils/request';
import { ValidationError } from '../../shared/errors/domain';

/** 쿼리/폼에서 `folderId`를 파싱한다. 빈 값·문자열 `"null"`은 루트(`null`)로 본다. */
function parseFolderIdParam(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'null') return null;
  return String(value);
}

/**
 * 모듈: 사용자 라이브러리 파일 HTTP 컨트롤러
 *
 * 책임:
 * - `/v1/files`, `/v1/sidebar-items` 요청을 검증하고 `UserFileService`에 위임한다.
 */
export class UserFileController {
  constructor(private readonly userFileService: UserFileService) {}

  /** `POST /v1/files` — multipart 필드명은 반드시 `file`. */
  async upload(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const file = req.file;
    if (!file?.buffer) {
      throw new ValidationError('multipart 필드 이름 `file` 로 파일을 보내 주세요.');
    }
    const folderId = parseFolderIdParam(req.body?.folderId);
    const originalName = file.originalname || 'upload.bin';
    const dto = await this.userFileService.uploadFile(userId, originalName, file.buffer, folderId);
    res.status(201).json(dto);
  }

  /** `GET /v1/files` */
  async list(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const folderId = parseFolderIdParam(req.query.folderId);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const result = await this.userFileService.listFiles(userId, folderId, limit, cursor);
    res.json(result);
  }

  /** `GET /v1/files/:id` */
  async getOne(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const dto = await this.userFileService.getFile(userId, req.params.id);
    res.json(dto);
  }

  /** `GET /v1/files/:id/content` — 원본 바이너리 스트리밍에 가깝게 응답. */
  async downloadContent(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const { buffer, contentType, displayName } = await this.userFileService.readFileBytes(
      userId,
      req.params.id
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`);
    res.send(buffer);
  }

  /** `DELETE /v1/files/:id` — `?permanent=true` 시 영구 삭제. */
  async remove(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const permanent = String(req.query.permanent || '') === 'true';
    await this.userFileService.deleteFile(userId, req.params.id, permanent);
    res.status(204).send();
  }

  /** `GET /v1/sidebar-items` */
  async sidebarItems(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const folderId = parseFolderIdParam(req.query.folderId);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const body = await this.userFileService.listSidebarItems(userId, folderId, limit);
    res.json(body);
  }
}
