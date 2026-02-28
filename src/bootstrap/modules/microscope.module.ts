/**
 * 모듈: Microscope 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { createMicroscopeRouter } from '../../app/routes/MicroscopeRouter';
import { MicroscopeController } from '../../app/controllers/MicroscopeController';
import { container } from '../container';

export function makeMicroscopeRouter(): Router {
  const microscopeService = container.getMicroscopeManagementService();
  const microscopeController = new MicroscopeController(microscopeService);

  return createMicroscopeRouter(microscopeController);
}
