/**
 * @module MacroViewModule
 * @description 매크로 뷰 도메인 DI 조립 모듈.
 */

import type { Router } from 'express';

import { createMacroViewRouter } from '../../app/routes/MacroViewRouter';
import { container } from '../container';

/**
 * @description MacroView 라우터를 생성하고 반환합니다.
 *
 * @returns Express Router
 */
export function makeMacroViewRouter(): Router {
  const macroViewService = container.getMacroViewService();
  return createMacroViewRouter(macroViewService);
}
