/**
 * 모듈: Sync 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { ConversationRepositoryMongo } from '../../infra/repositories/ConversationRepositoryMongo';
import { MessageRepositoryMongo } from '../../infra/repositories/MessageRepositoryMongo';
import { NoteRepositoryMongo } from '../../infra/repositories/NoteRepositoryMongo';
import { SyncService } from '../../core/services/SyncService';
import { createAuditProxy } from '../../shared/audit/auditProxy';
import { createSyncRouter } from '../../app/routes/sync';

export function makeSyncRouter(): Router {
  // Repositories
  const convRepo = new ConversationRepositoryMongo();
  const msgRepo = new MessageRepositoryMongo();
  const noteRepo = new NoteRepositoryMongo();

  // Services
  const rawSyncService = new SyncService(convRepo, msgRepo, noteRepo);
  const syncService = createAuditProxy(rawSyncService, 'SyncService');

  // Router(factory)
  return createSyncRouter({ syncService });
}
