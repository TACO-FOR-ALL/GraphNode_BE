import { Router } from 'express';

import { NoteRepositoryMongo } from '../../infra/repositories/NoteRepositoryMongo';
import { NoteService } from '../../core/services/NoteService';
import { createNoteRouter } from '../../app/routes/note.routes';

export function makeNoteRouter(): Router {
  const noteRepo = new NoteRepositoryMongo();
  const noteService = new NoteService(noteRepo);

  return createNoteRouter({ noteService });
}
