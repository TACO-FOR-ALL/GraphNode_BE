import type { Request, Response, NextFunction } from 'express';
import type { NotionService } from '../../core/services/NotionService';
import { ValidationError } from '../../shared/errors/domain';

/**
 * @description FE에서 사용자의 노션 데이터(트리)를 조회하기 위한 컨트롤러.
 * 지연 로딩(Lazy Loading) 방식으로 최상위 페이지 조회 및 자식 블록 조회를 수행합니다.
 */
export class NotionApiController {
  constructor(private readonly notionService: NotionService) {}

  /**
   * @description GET /api/notion/pages
   * 사용자가 접근 가능한 최상위(Root) 노션 페이지 목록을 조회합니다.
   */
  async getRootPages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new ValidationError('User ID missing from request');
      }

      const pages = await this.notionService.searchRootPages(userId);
      res.status(200).json({ results: pages });
    } catch (err) {
      next(err);
    }
  }

  /**
   * @description GET /api/notion/blocks/:blockId/children
   * 특정 페이지나 블록의 하위 자식 블록들을 페이지네이션하여 조회합니다.
   */
  async getBlockChildren(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new ValidationError('User ID missing from request');
      }

      const { blockId } = req.params;
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      if (!blockId) {
        throw new ValidationError('blockId is required');
      }

      const children = await this.notionService.listBlockChildrenProxy(userId, blockId, cursor);
      res.status(200).json(children);
    } catch (err) {
      next(err);
    }
  }
}
