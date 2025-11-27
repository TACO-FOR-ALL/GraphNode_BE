/**
 * 모듈: 노트/폴더 DTO↔Doc 매퍼
 * 책임: Transport DTO(Note/Folder)와 Persistence Doc(NoteDoc/FolderDoc) 간 변환을 담당한다.
 * 외부 의존: 없음
 * 공개 인터페이스: toNoteDto, toFolderDto
 */
import type { Note, Folder } from '../dtos/note';
import type { NoteDoc, FolderDoc } from '../../core/types/persistence/note.persistence';

/**
 * NoteDoc을 Note DTO로 변환한다.
 * @param doc Note 도큐먼트
 * @returns Note DTO
 */
export function toNoteDto(doc: NoteDoc): Note {
  return {
    id: doc._id,
    ownerUserId: doc.ownerUserId,
    title: doc.title,
    content: doc.content,
    folderId: doc.folderId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * FolderDoc을 Folder DTO로 변환한다.
 * @param doc Folder 도큐먼트
 * @returns Folder DTO
 */
export function toFolderDto(doc: FolderDoc): Folder {
  return {
    id: doc._id,
    ownerUserId: doc.ownerUserId,
    name: doc.name,
    parentId: doc.parentId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
