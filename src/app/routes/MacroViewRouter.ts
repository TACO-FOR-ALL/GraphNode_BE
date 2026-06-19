/**
 * @module MacroViewRouter
 * @description /v1/macro-views 라우터. MacroViewController에 요청을 위임합니다.
 */

import { Router } from 'express';

import type { MacroViewService } from '../../core/services/MacroViewService';
import { internalOrSession } from '../middlewares/internal';
import { asyncHandler } from '../utils/asyncHandler';
import { MacroViewController } from '../controllers/MacroViewController';

/**
 * @description MacroView 라우터 팩토리 함수.
 *
 * @param macroViewService MacroViewService 인스턴스
 * @returns Express Router
 */
export function createMacroViewRouter(macroViewService: MacroViewService): Router {
  const router = Router();
  const controller = new MacroViewController(macroViewService);

  router.use(internalOrSession);

  router.get('/', asyncHandler(controller.list));
  router.post('/', asyncHandler(controller.create));
  router.get('/:macroId', asyncHandler(controller.get));
  router.patch('/:macroId', asyncHandler(controller.update));
  router.delete('/:macroId', asyncHandler(controller.softDelete));
  router.post('/:macroId/clone', asyncHandler(controller.clone));
  router.post('/:macroId/restore', asyncHandler(controller.restore));

  return router;
}
