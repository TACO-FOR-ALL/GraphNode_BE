/**
 * 모듈: 노트/폴더 DTO↔Doc 매퍼
 * 
 * 책임: 
 * - Transport DTO(Note/Folder)와 Persistence Doc(NoteDoc/FolderDoc) 간의 데이터 변환을 담당합니다.
 * - DB에 저장된 날짜 객체(Date)를 클라이언트 전송용 ISO 문자열로 변환합니다.
 * 
 * 외부 의존: 없음
 * 공개 인터페이스: toNoteDto, toFolderDto
 */
import type { Note, Folder } from '../dtos/note';
import type { NoteDoc, FolderDoc } from '../../core/types/persistence/note.persistence';

/**
 * NoteDoc(DB 문서)을 Note DTO로 변환합니다.
 * 
 * @param doc Note 도큐먼트
 * @returns 클라이언트에게 전달할 Note DTO
 */
export function toNoteDto(doc: NoteDoc): Note {
  return {
    id: doc._id,
    title: doc.title,
    content: doc.content,
    folderId: doc.folderId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
  };
}

/**
 * FolderDoc(DB 문서)을 Folder DTO로 변환합니다.
 * 
 * @param doc Folder 도큐먼트
 * @returns 클라이언트에게 전달할 Folder DTO
 */
export function toFolderDto(doc: FolderDoc): Folder {
  return {
    id: doc._id,
    name: doc.name,
    parentId: doc.parentId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
  };
}

/**
 * Note 생성을 위한 DTO를 NoteDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 노트 생성 DTO
 * @param ownerUserId 소유자 사용자 ID
 * @returns DB에 저장될 NoteDoc 객체
 */
export function toNoteDoc(dto: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>, ownerUserId: string): Omit<NoteDoc, '_id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    ownerUserId,
    title: dto.title,
    content: dto.content,
    folderId: dto.folderId,
  };
}

/**
 * Folder 생성을 위한 DTO를 FolderDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 폴더 생성 DTO
 * @param ownerUserId 소유자 사용자 ID
 * @returns DB에 저장될 FolderDoc 객체
 */
export function toFolderDoc(dto: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>, ownerUserId: string): Omit<FolderDoc, '_id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    ownerUserId,
    name: dto.name,
    parentId: dto.parentId,
  };
}
