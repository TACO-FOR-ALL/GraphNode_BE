import { v4 as uuidv4 } from 'uuid';

import { NoteRepository } from '../ports/NoteRepository';
import { CreateNoteRequest, UpdateNoteRequest, CreateFolderRequest, UpdateFolderRequest } from '../../shared/dtos/note.schemas';
import { Note, Folder } from '../../shared/dtos/note';
import { NoteDoc, FolderDoc } from '../types/persistence/note.persistence';
import { getMongo } from '../../infra/db/mongodb';
import { NotFoundError } from '../../shared/errors/domain';
import { toNoteDto, toFolderDto } from '../../shared/mappers/note';

/**
 * 모듈: NoteService (노트 서비스)
 * 
 * 책임:
 * - 노트 및 폴더 관리의 핵심 비즈니스 로직을 담당합니다.
 * - 노트/폴더의 생성, 조회, 수정, 삭제 기능을 제공합니다.
 * - 폴더 삭제 시 하위 항목들을 함께 삭제하는 Cascade Delete 로직을 포함합니다.
 * - DTO(Data Transfer Object)와 DB 문서(Doc) 간의 변환을 수행합니다.
 */
export class NoteService {
  constructor(private noteRepo: NoteRepository) {}

  // --- 노트(Note) 관련 서비스 ---

  /**
   * 새 노트를 생성합니다.
   * 
   * @param userId 소유자 ID
   * @param dto 노트 생성 요청 데이터 (제목, 내용, 폴더ID 등)
   * @returns 생성된 노트 DTO
   */
  async createNote(userId: string, dto: CreateNoteRequest): Promise<Note> {
    const now = new Date();
    // DB 문서 생성
    const doc: NoteDoc = {
      _id: uuidv4(),
      ownerUserId: userId,
      title: dto.title || 'Untitled', // 제목이 없으면 기본값 설정
      content: dto.content,
      folderId: dto.folderId || null,
      createdAt: now,
      updatedAt: now,
    };
    
    const created = await this.noteRepo.createNote(doc);
    return toNoteDto(created);
  }

  /**
   * ID로 노트를 조회합니다.
   * 
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
   * 노트 목록을 조회합니다.
   * 
   * @param userId 소유자 ID
   * @param folderId 폴더 ID (null이면 루트 폴더의 노트 조회)
   * @returns 노트 DTO 목록
   */
  async listNotes(userId: string, folderId: string | null): Promise<Note[]> {
    const docs = await this.noteRepo.listNotes(userId, folderId);
    return docs.map(doc => toNoteDto(doc));
  }

  /**
   * 노트를 수정합니다.
   * 
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @param dto 노트 수정 요청 데이터
   * @returns 수정된 노트 DTO
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async updateNote(userId: string, noteId: string, dto: UpdateNoteRequest): Promise<Note> {
    const updates: Partial<NoteDoc> = {
      ...dto,
      updatedAt: new Date(),
    };
    // undefined 필드는 업데이트에서 제외
    Object.keys(updates).forEach(key => (updates as any)[key] === undefined && delete (updates as any)[key]);

    const updated = await this.noteRepo.updateNote(noteId, userId, updates);
    if (!updated) throw new NotFoundError(`Note not found: ${noteId}`);
    return toNoteDto(updated);
  }

  /**
   * 노트를 삭제합니다.
   * 
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async deleteNote(userId: string, noteId: string): Promise<void> {
    const deleted = await this.noteRepo.deleteNote(noteId, userId);
    if (!deleted) throw new NotFoundError(`Note not found: ${noteId}`);
  }

  // --- 폴더(Folder) 관련 서비스 ---

  /**
   * 새 폴더를 생성합니다.
   * 
   * @param userId 소유자 ID
   * @param dto 폴더 생성 요청 데이터
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
   * ID로 폴더를 조회합니다.
   * 
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
   * 폴더 목록을 조회합니다.
   * 
   * @param userId 소유자 ID
   * @param parentId 상위 폴더 ID (null이면 루트 폴더의 하위 폴더 조회)
   * @returns 폴더 DTO 목록
   */
  async listFolders(userId: string, parentId: string | null): Promise<Folder[]> {
    const docs = await this.noteRepo.listFolders(userId, parentId);
    return docs.map(doc => toFolderDto(doc));
  }

  /**
   * 폴더를 수정합니다.
   * 
   * @param userId 소유자 ID
   * @param folderId 폴더 ID
   * @param dto 폴더 수정 요청 데이터
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
   * 
   * - 해당 폴더뿐만 아니라, 그 안에 포함된 모든 하위 폴더와 노트들을 재귀적으로 삭제합니다.
   * - 데이터 무결성을 위해 트랜잭션을 사용하여 원자적으로 처리합니다.
   * 
   * @param userId 소유자 ID
   * @param folderId 삭제할 폴더 ID
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
            // 트랜잭션 내에서 에러를 던지면 자동으로 롤백됩니다.
            throw new NotFoundError(`Folder not found: ${folderId}`);
        }

        // 2. 모든 하위 폴더 ID 조회 (재귀적 탐색)
        const descendantIds = await this.noteRepo.findDescendantFolderIds(folderId, userId);
        
        // 3. 삭제할 모든 폴더 ID 목록 구성 (타겟 폴더 포함)
        const allFolderIdsToDelete = [folderId, ...descendantIds];

        // 4. 해당 폴더들에 속한 모든 노트 일괄 삭제
        await this.noteRepo.deleteNotesByFolderIds(allFolderIdsToDelete, userId, session);

        // 5. 폴더들 일괄 삭제
        await this.noteRepo.deleteFolders(allFolderIdsToDelete, userId, session);
      });
    } finally {
      await session.endSession();
    }
  }
}
