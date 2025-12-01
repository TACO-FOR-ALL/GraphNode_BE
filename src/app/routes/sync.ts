import { Router } from 'express';

import { SyncController } from '../controllers/sync';
import { SyncService } from '../../core/services/SyncService';
import { ConversationRepositoryMongo } from '../../infra/repositories/ConversationRepositoryMongo';
import { MessageRepositoryMongo } from '../../infra/repositories/MessageRepositoryMongo';
import { NoteRepositoryMongo } from '../../infra/repositories/NoteRepositoryMongo';
import { requireLogin } from '../middlewares/auth';
import { bindSessionUser } from '../middlewares/session';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// DI (Dependency Injection) - 수동 주입
const convRepo: ConversationRepositoryMongo = new ConversationRepositoryMongo();
const msgRepo: MessageRepositoryMongo = new MessageRepositoryMongo();
const noteRepo: NoteRepositoryMongo = new NoteRepositoryMongo();
const syncService: SyncService = new SyncService(convRepo, msgRepo, noteRepo);
const syncController: SyncController = new SyncController(syncService);

// 보호 구역(세션 바인딩 + 인증)
router.use(bindSessionUser, requireLogin);

router.get('/pull', asyncHandler(syncController.pull.bind(syncController)));
router.post('/push', asyncHandler(syncController.push.bind(syncController)));

export default router;
