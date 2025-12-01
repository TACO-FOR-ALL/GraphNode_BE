import { Router } from 'express';

import { NoteService } from '../../core/services/NoteService';
import { NoteController } from '../controllers/note.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';

/**
 * 모듈: Note 라우터 팩토리
 * 책임: NoteService를 주입받아 NoteController를 생성하고, 라우팅을 설정한다.
 * 
 * - 모든 라우트에 인증 미들웨어(bindSessionUser, requireLogin)가 적용된다.
 * - 비동기 핸들러는 asyncHandler로 래핑하여 에러를 중앙 처리한다.
 * 
 * @param deps 의존성 객체 (NoteService)
 * @returns Express Router
 */
export function createNoteRouter(deps: { noteService: NoteService }) {
  const router = Router();
  const controller = new NoteController(deps.noteService);

  // 인증 미들웨어 적용
  router.use(bindSessionUser, requireLogin);

  // --- Notes ---
  router.post('/notes', asyncHandler(controller.createNote.bind(controller)));
  router.get('/notes', asyncHandler(controller.listNotes.bind(controller)));
  router.get('/notes/:id', asyncHandler(controller.getNote.bind(controller)));
  router.patch('/notes/:id', asyncHandler(controller.updateNote.bind(controller)));
  router.delete('/notes/:id', asyncHandler(controller.deleteNote.bind(controller)));
  router.post('/notes/:id/restore', asyncHandler(controller.restoreNote.bind(controller)));

  // --- Folders ---
  router.post('/folders', asyncHandler(controller.createFolder.bind(controller)));
  router.get('/folders', asyncHandler(controller.listFolders.bind(controller)));
  router.get('/folders/:id', asyncHandler(controller.getFolder.bind(controller)));
  router.patch('/folders/:id', asyncHandler(controller.updateFolder.bind(controller)));
  router.delete('/folders/:id', asyncHandler(controller.deleteFolder.bind(controller)));
  router.post('/folders/:id/restore', asyncHandler(controller.restoreFolder.bind(controller)));

  return router;
}
