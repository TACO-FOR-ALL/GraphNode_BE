/**
 * 모듈: Sync 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { createSyncRouter } from '../../app/routes/SyncRouter';
import { container } from '../container';

export function makeSyncRouter(): Router {
  const syncService = container.getSyncService();

  // Router(factory)
  return createSyncRouter({ syncService });
}
