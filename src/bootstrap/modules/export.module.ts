/**
 * 모듈: Export 컴포지션(의존성 조립)
 * 책임: ChatExportService를 조립하고 Export 라우터를 반환합니다.
 */
import type { Router } from 'express';

import { createExportRouter } from '../../app/routes/ExportRouter';
import { container } from '../container';

export function makeExportRouter(): Router {
  return createExportRouter({
    chatExportService: container.getChatExportService(),
  });
}
