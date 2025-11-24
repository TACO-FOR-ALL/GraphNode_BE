import { Request, Response } from 'express';

import { NoteService } from '../../core/services/NoteService';
import { createNoteSchema, updateNoteSchema, createFolderSchema, updateFolderSchema } from '../../shared/dtos/note.schemas';
import { ValidationError } from '../../shared/errors/domain';

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
    const userId = (req as any).userId;
    const validation = createNoteSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError(validation.error.message);
    }
    const note = await this.noteService.createNote(userId, validation.data);
    res.status(201).json(note);
  }

  /**
   * 노트 상세 조회 핸들러
   * GET /v1/notes/:id
   */
  async getNote(req: Request, res: Response) {
    const userId = (req as any).userId;
    const { id } = req.params;
    const note = await this.noteService.getNote(userId, id);
    res.json(note);
  }

  /**
   * 노트 목록 조회 핸들러
   * GET /v1/notes?folderId=...
   */
  async listNotes(req: Request, res: Response) {
    const userId = (req as any).userId;
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : null;
    const notes = await this.noteService.listNotes(userId, folderId);
    res.json(notes);
  }

  /**
   * 노트 수정 핸들러
   * PATCH /v1/notes/:id
   */
  async updateNote(req: Request, res: Response) {
    const userId = (req as any).userId;
    const { id } = req.params;
    const validation = updateNoteSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError(validation.error.message);
    }
    const note = await this.noteService.updateNote(userId, id, validation.data);
    res.json(note);
  }

  /**
   * 노트 삭제 핸들러
   * DELETE /v1/notes/:id
   */
  async deleteNote(req: Request, res: Response) {
    const userId = (req as any).userId;
    const { id } = req.params;
    await this.noteService.deleteNote(userId, id);
    res.status(204).send();
  }

  // --- Folder Handlers ---

  /**
   * 폴더 생성 핸들러
   * POST /v1/folders
   */
  async createFolder(req: Request, res: Response) {
    const userId = (req as any).userId;
    const validation = createFolderSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError(validation.error.message);
    }
    const folder = await this.noteService.createFolder(userId, validation.data);
    res.status(201).json(folder);
  }

  /**
   * 폴더 상세 조회 핸들러
   * GET /v1/folders/:id
   */
  async getFolder(req: Request, res: Response) {
    const userId = (req as any).userId;
    const { id } = req.params;
    const folder = await this.noteService.getFolder(userId, id);
    res.json(folder);
  }

  /**
   * 폴더 목록 조회 핸들러
   * GET /v1/folders?parentId=...
   */
  async listFolders(req: Request, res: Response) {
    const userId = (req as any).userId;
    const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : null;
    const folders = await this.noteService.listFolders(userId, parentId);
    res.json(folders);
  }

  /**
   * 폴더 수정 핸들러
   * PATCH /v1/folders/:id
   */
  async updateFolder(req: Request, res: Response) {
    const userId = (req as any).userId;
    const { id } = req.params;
    const validation = updateFolderSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError(validation.error.message);
    }
    const folder = await this.noteService.updateFolder(userId, id, validation.data);
    res.json(folder);
  }

  /**
   * 폴더 삭제 핸들러
   * DELETE /v1/folders/:id
   */
  async deleteFolder(req: Request, res: Response) {
    const userId = (req as any).userId;
    const { id } = req.params;
    await this.noteService.deleteFolder(userId, id);
    res.status(204).send();
  }
}
