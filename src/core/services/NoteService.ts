import { v4 as uuidv4 } from 'uuid';

import { NoteRepository } from '../ports/NoteRepository';
import { CreateNoteRequest, UpdateNoteRequest, CreateFolderRequest, UpdateFolderRequest } from '../../shared/dtos/note.schemas';
import { Note, Folder } from '../../shared/dtos/note';
import { NoteDoc, FolderDoc } from '../types/persistence/note.persistence';
import { getMongo } from '../../infra/db/mongodb';
import { NotFoundError } from '../../shared/errors/domain';
import { toNoteDto, toFolderDto } from '../../shared/mappers/note';

/**
 * 모듈: NoteService
 * 책임: 노트 및 폴더 관련 비즈니스 로직을 담당한다.
 * 
 * - 노트/폴더 생성, 조회, 수정, 삭제
 * - 폴더 삭제 시 하위 폴더 및 노트 일괄 삭제 (Cascade Delete)
 * - DTO <-> Persistence Doc 변환
 */
export class NoteService {
  constructor(private noteRepo: NoteRepository) {}

  // --- Note Services ---

  /**
   * 새 노트를 생성한다.
   * @param userId 소유자 ID
   * @param dto 노트 생성 요청 DTO
   * @returns 생성된 노트 DTO
   */
  async createNote(userId: string, dto: CreateNoteRequest): Promise<Note> {
    const now = new Date();
    const doc: NoteDoc = {
      _id: uuidv4(),
      ownerUserId: userId,
      title: dto.title || 'Untitled', // 제목이 없으면 기본값
      content: dto.content,
      folderId: dto.folderId || null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.noteRepo.createNote(doc);
    return toNoteDto(created);
  }

  /**
   * ID로 노트를 조회한다.
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @returns 노트 DTO
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async getNote(userId: string, noteId: string): Promise<Note> {
    const note = await this.noteRepo.getNote(noteId, userId);
    if (!note) throw new NotFoundError(`Note not found: ${noteId}`);
    return toNoteDto(note);
  }

  /**
   * 노트 목록을 조회한다.
   * @param userId 소유자 ID
   * @param folderId 폴더 ID (null이면 루트)
   * @returns 노트 DTO 목록
   */
  async listNotes(userId: string, folderId: string | null): Promise<Note[]> {
    const docs = await this.noteRepo.listNotes(userId, folderId);
    return docs.map(doc => toNoteDto(doc));
  }

  /**
   * 노트를 수정한다.
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @param dto 노트 수정 요청 DTO
   * @returns 수정된 노트 DTO
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async updateNote(userId: string, noteId: string, dto: UpdateNoteRequest): Promise<Note> {
    const updates: Partial<NoteDoc> = {
      ...dto,
      updatedAt: new Date(),
    };
    // undefined 필드 제거
    Object.keys(updates).forEach(key => (updates as any)[key] === undefined && delete (updates as any)[key]);

    const updated = await this.noteRepo.updateNote(noteId, userId, updates);
    if (!updated) throw new NotFoundError(`Note not found: ${noteId}`);
    return toNoteDto(updated);
  }

  /**
   * 노트를 삭제한다.
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async deleteNote(userId: string, noteId: string): Promise<void> {
    const deleted = await this.noteRepo.deleteNote(noteId, userId);
    if (!deleted) throw new NotFoundError(`Note not found: ${noteId}`);
  }

  // --- Folder Services ---

  /**
   * 새 폴더를 생성한다.
   * @param userId 소유자 ID
   * @param dto 폴더 생성 요청 DTO
   * @returns 생성된 폴더 DTO
   */
  async createFolder(userId: string, dto: CreateFolderRequest): Promise<Folder> {
    const now = new Date();
    const doc: FolderDoc = {
      _id: uuidv4(),
      ownerUserId: userId,
      name: dto.name,
      parentId: dto.parentId || null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.noteRepo.createFolder(doc);
    return toFolderDto(created);
  }

  /**
   * ID로 폴더를 조회한다.
   * @param userId 소유자 ID
   * @param folderId 폴더 ID
   * @returns 폴더 DTO
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   */
  async getFolder(userId: string, folderId: string): Promise<Folder> {
    const folder = await this.noteRepo.getFolder(folderId, userId);
    if (!folder) throw new NotFoundError(`Folder not found: ${folderId}`);
    return toFolderDto(folder);
  }

  /**
   * 폴더 목록을 조회한다.
   * @param userId 소유자 ID
   * @param parentId 상위 폴더 ID (null이면 루트)
   * @returns 폴더 DTO 목록
   */
  async listFolders(userId: string, parentId: string | null): Promise<Folder[]> {
    const docs = await this.noteRepo.listFolders(userId, parentId);
    return docs.map(doc => toFolderDto(doc));
  }

  /**
   * 폴더를 수정한다.
   * @param userId 소유자 ID
   * @param folderId 폴더 ID
   * @param dto 폴더 수정 요청 DTO
   * @returns 수정된 폴더 DTO
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   */
  async updateFolder(userId: string, folderId: string, dto: UpdateFolderRequest): Promise<Folder> {
    const updates: Partial<FolderDoc> = {
      ...dto,
      updatedAt: new Date(),
    };
    Object.keys(updates).forEach(key => (updates as any)[key] === undefined && delete (updates as any)[key]);

    const updated = await this.noteRepo.updateFolder(folderId, userId, updates);
    if (!updated) throw new NotFoundError(`Folder not found: ${folderId}`);
    return toFolderDto(updated);
  }

  /**
   * 폴더 삭제 (Cascade Delete)
   * - 해당 폴더와 모든 하위 폴더, 그리고 그 안에 포함된 모든 노트를 삭제한다.
   * - 트랜잭션을 사용하여 원자성을 보장한다.
   * @param userId 소유자 ID
   * @param folderId 폴더 ID
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   */
  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const client = getMongo();
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. 삭제 대상 폴더 존재 확인
        const targetFolder = await this.noteRepo.getFolder(folderId, userId);
        if (!targetFolder) {
            // 트랜잭션 내에서 에러를 던지면 abortTransaction이 호출됨
            throw new NotFoundError(`Folder not found: ${folderId}`);
        }

        // 2. 모든 하위 폴더 ID 조회 (재귀)
        const descendantIds = await this.noteRepo.findDescendantFolderIds(folderId, userId);
        
        // 3. 삭제할 모든 폴더 ID 목록 (타겟 포함)
        const allFolderIdsToDelete = [folderId, ...descendantIds];

        // 4. 해당 폴더들에 속한 노트 일괄 삭제
        await this.noteRepo.deleteNotesByFolderIds(allFolderIdsToDelete, userId, session);

        // 5. 폴더 일괄 삭제
        await this.noteRepo.deleteFolders(allFolderIdsToDelete, userId, session);
      });
    } finally {
      await session.endSession();
    }
  }
}
