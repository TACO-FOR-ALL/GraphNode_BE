/**
 * @module MacroViewController
 * @description 매크로 뷰 생명주기 HTTP 핸들러. Zod 검증 · Service 위임 · 응답 직렬화만 담당. ≤150 LOC.
 */

import type { NextFunction, Request, Response } from 'express';

import type { MacroViewService } from '../../core/services/MacroViewService';
import { getUserIdFromRequest } from '../utils/request';
import {
  createMacroViewSchema,
  listMacroViewsQuerySchema,
  updateMacroViewSchema,
} from '../../shared/dtos/macro.schemas';

/**
 * @description 매크로 뷰 CRUD HTTP 핸들러 클래스.
 *
 * 모든 핸들러는 Zod 스키마로 입력을 검증한 뒤 MacroViewService에 위임합니다.
 */
export class MacroViewController {
  constructor(private readonly macroViewService: MacroViewService) {}

  /**
   * @description GET /v1/macro-views — 사용자의 매크로 뷰 목록 조회.
   *
   * @param req `req.user.id`: 인증된 사용자 ID. `req.query`: sortBy, onlyDeleted
   * @param res `200 { views: MacroViewDto[] }`
   */
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listMacroViewsQuerySchema.parse(req.query);
      const views = await this.macroViewService.listMacroViews(getUserIdFromRequest(req)!, query);
      res.status(200).json({ views });
    } catch (err) {
      next(err);
    }
  };

  /**
   * @description GET /v1/macro-views/:macroId — 단일 매크로 뷰 조회.
   *
   * @param req `req.params.macroId`: 조회할 매크로 뷰 ID
   * @param res `200 { view: MacroViewDto }` 또는 `404`
   */
  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { macroId } = req.params;
      const view = await this.macroViewService.getMacroView(getUserIdFromRequest(req)!, macroId);
      if (!view) {
        res.status(404).json({ message: 'MacroView not found' });
        return;
      }
      res.status(200).json({ view });
    } catch (err) {
      next(err);
    }
  };

  /**
   * @description POST /v1/macro-views — 새 매크로 뷰 생성 및 AI 파이프라인 트리거.
   *
   * @param req `req.body`: CreateMacroViewDto
   * @param res `201 { view: MacroViewDto }`
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = createMacroViewSchema.parse(req.body);
      const view = await this.macroViewService.createMacroView(getUserIdFromRequest(req)!, dto);
      res.status(201).location(`/v1/macro-views/${view.macroId}`).json({ view });
    } catch (err) {
      next(err);
    }
  };

  /**
   * @description PATCH /v1/macro-views/:macroId — 매크로 뷰 메타데이터 수정.
   *
   * @param req `req.params.macroId`, `req.body`: UpdateMacroViewDto
   * @param res `200 { view: MacroViewDto }`
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { macroId } = req.params;
      const patch = updateMacroViewSchema.parse(req.body);
      const view = await this.macroViewService.updateMacroView(getUserIdFromRequest(req)!, macroId, patch);
      res.status(200).json({ view });
    } catch (err) {
      next(err);
    }
  };

  /**
   * @description POST /v1/macro-views/:macroId/clone — 매크로 뷰 복제.
   *
   * @param req `req.params.macroId`: 복제할 원본 매크로 뷰 ID
   * @param res `201 { view: MacroViewDto }`
   */
  clone = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { macroId } = req.params;
      const view = await this.macroViewService.cloneMacroView(getUserIdFromRequest(req)!, macroId);
      res.status(201).location(`/v1/macro-views/${view.macroId}`).json({ view });
    } catch (err) {
      next(err);
    }
  };

  /**
   * @description DELETE /v1/macro-views/:macroId — 매크로 뷰 Soft Delete.
   *
   * @param req `req.params.macroId`
   * @param res `204 No Content`
   */
  softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { macroId } = req.params;
      await this.macroViewService.softDeleteMacroView(getUserIdFromRequest(req)!, macroId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  /**
   * @description POST /v1/macro-views/:macroId/restore — Soft Delete된 뷰 복원.
   *
   * @param req `req.params.macroId`
   * @param res `200 { message: string }`
   */
  restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { macroId } = req.params;
      await this.macroViewService.restoreMacroView(getUserIdFromRequest(req)!, macroId);
      res.status(200).json({ message: 'MacroView restored' });
    } catch (err) {
      next(err);
    }
  };
}
