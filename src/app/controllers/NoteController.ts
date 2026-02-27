import { Request, Response } from 'express';
import { z } from 'zod';

import { NoteService } from '../../core/services/NoteService';
import {
  createNoteSchema,
  updateNoteSchema,
  createFolderSchema,
  updateFolderSchema,
} from '../../shared/dtos/note.schemas';
import { getUserIdFromRequest } from '../utils/request';
import { Note, Folder } from '../../shared/dtos/note';

/**
 * 모듈: NoteController
 * 책임: 노트 및 폴더 관련 HTTP 요청을 처리한다.
 *
 * - 요청 데이터 검증 (Zod Schema)
 * - Service 계층 호출
 * - HTTP 응답 반환
 */
export class NoteController {
  constructor(private noteService: NoteService) {}

  // --- Note Handlers ---

  /**
   * 노트 생성 핸들러
   * POST /v1/notes
   */
  async createNote(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    // Zod 스키마 검증 (실패 시 자동 throw)
    const data: z.infer<typeof createNoteSchema> = createNoteSchema.parse(req.body);
    const note: Note = await this.noteService.createNote(userId, data);
    res.status(201).json(note);
  }

  /**
   * 노트 상세 조회 핸들러
   * GET /v1/notes/:id
   */
  async getNote(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    const note: Note = await this.noteService.getNote(userId, id);
    res.json(note);
  }

  /**
   * 노트 목록 조회 핸들러
   * GET /v1/notes?folderId=...
   */
  async listNotes(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const folderId: string | null =
      typeof req.query.folderId === 'string' ? req.query.folderId : null;
    const notes: Note[] = await this.noteService.listNotes(userId, folderId);
    res.json(notes);
  }

  /**
   * 노트 수정 핸들러
   * PATCH /v1/notes/:id
   */
  async updateNote(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    const data: z.infer<typeof updateNoteSchema> = updateNoteSchema.parse(req.body);
    const note: Note = await this.noteService.updateNote(userId, id, data);
    res.json(note);
  }

  /**
   * 노트 삭제 핸들러
   * DELETE /v1/notes/:id
   *
   * Query Params:
   * - permanent: 'true'이면 영구 삭제 (Hard Delete), 그 외에는 Soft Delete
   */
  async deleteNote(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    const permanent: boolean = req.query.permanent === 'true';

    await this.noteService.deleteNote(userId, id, permanent);
    res.status(204).send();
  }

  /**
   * 노트 복구 핸들러
   * POST /v1/notes/:id/restore
   */
  async restoreNote(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    await this.noteService.restoreNote(userId, id);
    res.status(204).send();
  }

  // --- Folder Handlers ---

  /**
   * 폴더 생성 핸들러
   * POST /v1/folders
   */
  async createFolder(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const data: z.infer<typeof createFolderSchema> = createFolderSchema.parse(req.body);
    const folder: Folder = await this.noteService.createFolder(userId, data);
    res.status(201).json(folder);
  }

  /**
   * 폴더 상세 조회 핸들러
   * GET /v1/folders/:id
   */
  async getFolder(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    const folder: Folder = await this.noteService.getFolder(userId, id);
    res.json(folder);
  }

  /**
   * 폴더 목록 조회 핸들러
   * GET /v1/folders?parentId=...
   */
  async listFolders(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const parentId: string | null =
      typeof req.query.parentId === 'string' ? req.query.parentId : null;
    const folders: Folder[] = await this.noteService.listFolders(userId, parentId);
    res.json(folders);
  }

  /**
   * 폴더 수정 핸들러
   * PATCH /v1/folders/:id
   */
  async updateFolder(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    const data: z.infer<typeof updateFolderSchema> = updateFolderSchema.parse(req.body);
    const folder: Folder = await this.noteService.updateFolder(userId, id, data);
    res.json(folder);
  }

  /**
   * 폴더 삭제 핸들러
   * DELETE /v1/folders/:id
   *
   * Query Params:
   * - permanent: 'true'이면 영구 삭제 (Hard Delete), 그 외에는 Soft Delete
   */
  async deleteFolder(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    const permanent: boolean = req.query.permanent === 'true';

    await this.noteService.deleteFolder(userId, id, permanent);
    res.status(204).send();
  }

  /**
   * 폴더 복구 핸들러
   * POST /v1/folders/:id/restore
   */
  async restoreFolder(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const { id } = req.params;
    await this.noteService.restoreFolder(userId, id);
    res.status(204).send();
  }

  /**
   * 모든 노트 삭제 핸들러
   * DELETE /v1/notes
   *
   * 역할:
   * - 사용자의 모든 노트를 삭제합니다.
   *
   * 응답: 200 OK, { deletedCount: number }
   */
  async deleteAllNotes(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const count = await this.noteService.deleteAllNotes(userId);
    res.status(200).json({ deletedCount: count });
  }

  /**
   * 모든 폴더 삭제 핸들러
   * DELETE /v1/folders
   *
   * 역할:
   * - 사용자의 모든 폴더와 그 안의 노트를 삭제합니다.
   * - 트랜잭션을 사용하여 원자적으로 처리됩니다.
   *
   * 응답: 200 OK, { deletedCount: number }
   */
  async deleteAllFolders(req: Request, res: Response) {
    const userId: string = getUserIdFromRequest(req)!;
    const count = await this.noteService.deleteAllFolders(userId);
    res.status(200).json({ deletedCount: count });
  }
}
