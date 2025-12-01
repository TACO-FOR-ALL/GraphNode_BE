import { Request, Response, NextFunction } from 'express';

import { SyncService } from '../../core/services/SyncService';
import { SyncPullResponse, SyncPushRequest } from '../../shared/dtos/sync';
import { syncPushSchema } from '../../shared/dtos/sync.schemas';
import { getUserIdFromRequest } from '../utils/request';

/**
 * 모듈: SyncController
 * 
 * 책임:
 * - 클라이언트의 동기화 요청(Pull/Push)을 받아 검증하고 서비스로 전달합니다.
 * - Pull: 서버의 최신 변경사항을 클라이언트에게 전달합니다.
 * - Push: 클라이언트의 변경사항을 서버에 반영합니다.
 * 
 * 변경사항:
 * - 함수형 컨트롤러에서 클래스 기반 컨트롤러(Dependency Injection)로 리팩토링되었습니다.
 */
export class SyncController {
  constructor(private syncService: SyncService) {}

  /**
   * 변경사항 조회 (Pull) 핸들러
   * GET /v1/sync/pull
   */
  async pull(req: Request, res: Response, next: NextFunction) {
    try {
      const userId: string = getUserIdFromRequest(req)!;
      const sinceStr: string | undefined = req.query.since as string | undefined;
      
      const result: SyncPullResponse = await this.syncService.pull(userId, sinceStr);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * 변경사항 반영 (Push) 핸들러
   * POST /v1/sync/push
   */
  async push(req: Request, res: Response, next: NextFunction) {
    try {
      const userId: string = getUserIdFromRequest(req)!;
      
      // Zod 스키마를 사용하여 요청 바디를 검증하고 파싱합니다.
      // 실패 시 ZodError가 발생하며, 이는 글로벌 에러 핸들러에서 400 ValidationError로 변환됩니다.
      const changes: SyncPushRequest = syncPushSchema.parse(req.body) as SyncPushRequest;

      await this.syncService.push(userId, changes);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
