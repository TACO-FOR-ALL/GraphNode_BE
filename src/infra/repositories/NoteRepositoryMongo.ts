import { Collection, ClientSession, WithId, DeleteResult, UpdateResult } from 'mongodb';

import { NoteRepository } from '../../core/ports/NoteRepository';
import { NoteDoc, FolderDoc } from '../../core/types/persistence/note.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * 모듈: NoteRepository MongoDB 구현체
 * 책임: MongoDB를 사용하여 노트 및 폴더 데이터를 영속화한다.
 *
 * - `notes` 컬렉션과 `folders` 컬렉션을 사용한다.
 * - `$graphLookup`을 사용하여 계층형 폴더 구조를 효율적으로 조회한다.
 */
export class NoteRepositoryMongo implements NoteRepository {
  /**
   * 'notes' 컬렉션 접근 헬퍼
   */
  private notesCol(): Collection<NoteDoc> {
    return getMongo().db().collection<NoteDoc>('notes');
  }

  /**
   * 'folders' 컬렉션 접근 헬퍼
   */
  private foldersCol(): Collection<FolderDoc> {
    return getMongo().db().collection<FolderDoc>('folders');
  }

  // --- Note Operations ---

  /**
   * 노트를 생성한다.
   * @param doc 생성할 노트 문서
   * @param session (선택) 트랜잭션 세션
   * @returns 생성된 노트 문서
   */
  async createNote(doc: NoteDoc, session?: ClientSession): Promise<NoteDoc> {
    try {
      await this.notesCol().insertOne(doc, { session });
      return doc;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.createNote', err);
    }
  }

  /**
   * ID로 노트를 조회한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 사용자 ID
   * @returns 노트 문서 또는 null
   */
  async getNote(id: string, ownerUserId: string, includeDeleted: boolean = false): Promise<NoteDoc | null> {
    try {
      const filter: any = { _id: id, ownerUserId };
      if (!includeDeleted) {
        filter.deletedAt = null;
      }
      return this.notesCol().findOne(filter);
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.getNote', err);
    }
  }

  /**
   * 특정 폴더(또는 루트)의 노트 목록을 조회한다.
   * @param ownerUserId 소유자 사용자 ID
   * @param folderId 폴더 ID (null이면 루트 폴더)
   * @returns 노트 문서 배열
   */
  async listNotes(ownerUserId: string, folderId: string | null): Promise<NoteDoc[]> {
    try {
      return this.notesCol().find({ ownerUserId, folderId, deletedAt: null }).toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.listNotes', err);
    }
  }

  /**
   * 노트를 수정한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param updates 수정할 필드들
   * @param session (선택) 트랜잭션 세션
   * @returns 수정된 노트 문서 또는 null
   */
  async updateNote(
    id: string,
    ownerUserId: string,
    updates: Partial<NoteDoc>,
    session?: ClientSession
  ): Promise<NoteDoc | null> {
    try {
      const result = await this.notesCol().findOneAndUpdate(
        { _id: id, ownerUserId, deletedAt: null },
        { $set: updates },
        { returnDocument: 'after', session }
      );
      return result;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.updateNote', err);
    }
  }

  /**
   * 노트를 삭제한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @return 삭제 성공 여부
   */
  async deleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.notesCol().deleteOne({ _id: id, ownerUserId }, { session });
      return result.deletedCount === 1;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteNote', err);
    }
  }

  /**
   * 노트를 soft delete 한다
   * @param id 노트 id
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  async softDeleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result: UpdateResult<NoteDoc> = await this.notesCol().updateOne(
        { _id: id, ownerUserId },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.softDeleteNote', err);
    }
  }
  /**
   * 사용자의 모든 노트를 삭제합니다.
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 노트 수
   */
  async deleteAllNotes(ownerUserId: string, session?: ClientSession): Promise<number> {
    try {
      const result = await this.notesCol().deleteMany({ ownerUserId }, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteAllNotes', err);
    }
  }

  /**
   * 폴더에 속한 모든 노트를 삭제합니다. (루트 노트 제외)
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 노트 수
   */
  async deleteAllNotesInFolders(ownerUserId: string, session?: ClientSession): Promise<number> {
    try {
      const result = await this.notesCol().deleteMany(
        { ownerUserId, folderId: { $ne: null } },
        { session }
      );
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteAllNotesInFolders', err);
    }
  }
  /**
   * 노트를 영구 삭제(Hard Delete)한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  async hardDeleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.notesCol().deleteOne({ _id: id, ownerUserId }, { session });
      return result.deletedCount > 0;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.hardDeleteNote', err);
    }
  }

  /**
   * 삭제된 노트를 복구한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구 성공 여부
   */
  async restoreNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.notesCol().updateOne(
        { _id: id, ownerUserId },
        { $set: { deletedAt: null, updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.restoreNote', err);
    }
  }

  /**
   * 특정 시점 이후에 수정된 노트 목록을 조회한다. (동기화용)
   * @param ownerUserId 소유자 사용자 ID
   * @param since 기준 시각
   * @returns 변경된 노트 문서 배열
   */
  async findNotesModifiedSince(ownerUserId: string, since: Date): Promise<NoteDoc[]> {
    try {
      return this.notesCol()
        .find({
          ownerUserId,
          updatedAt: { $gte: since },
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.findNotesModifiedSince', err);
    }
  }

  /**
   * 특정 시점 이후에 수정된 폴더 목록을 조회한다. (동기화용)
   * @param ownerUserId 소유자 사용자 ID
   * @param since 기준 시각
   * @returns 변경된 폴더 문서 배열
   */
  async findFoldersModifiedSince(ownerUserId: string, since: Date): Promise<FolderDoc[]> {
    try {
      return this.foldersCol()
        .find({
          ownerUserId,
          updatedAt: { $gte: since },
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.findFoldersModifiedSince', err);
    }
  }

  /**
   * 여러 폴더에 속한 노트들을 조회합니다.
   */
  async listNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    includeDeleted?: boolean
  ): Promise<NoteDoc[]> {
    try {
      if (folderIds.length === 0) return [];
      const query: any = { folderId: { $in: folderIds }, ownerUserId };
      if (!includeDeleted) {
        query.deletedAt = null;
      }
      return await this.notesCol().find(query).toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.listNotesByFolderIds', err);
    }
  }

  /**
   * 휴지통 항목 조회: 삭제된 노트 목록을 조회합니다.
   */
  async listTrashNotes(ownerUserId: string): Promise<NoteDoc[]> {
    try {
      return this.notesCol().find({ ownerUserId, deletedAt: { $ne: null } }).toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.listTrashNotes', err);
    }
  }

  /**
   * 휴지통 항목 조회: 삭제된 폴더 목록을 조회합니다.
   */
  async listTrashFolders(ownerUserId: string): Promise<FolderDoc[]> {
    try {
      return this.foldersCol().find({ ownerUserId, deletedAt: { $ne: null } }).toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.listTrashFolders', err);
    }
  }

  /**
   * 여러 폴더에 속한 노트들을 일괄 삭제한다.
   * @param folderIds 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 노트 수
   */
  async deleteNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (folderIds.length === 0) return 0;
      const result: DeleteResult = await this.notesCol().deleteMany(
        { folderId: { $in: folderIds }, ownerUserId },
        { session }
      );
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteNotesByFolderIds', err);
    }
  }

  /**
   * 여러 폴더에 속한 노트들을 일괄 Soft Delete 한다.
   * @param folderIds 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 업데이트된 노트 수
   */
  async softDeleteNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (folderIds.length === 0) return 0;
      const result: UpdateResult<NoteDoc> = await this.notesCol().updateMany(
        { folderId: { $in: folderIds }, ownerUserId },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.softDeleteNotesByFolderIds', err);
    }
  }

  /**
   * 여러 폴더에 속한 노트들을 일괄 Hard Delete 한다.
   * @param folderIds 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 노트 수
   */
  async hardDeleteNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (folderIds.length === 0) return 0;
      const result: DeleteResult = await this.notesCol().deleteMany(
        { folderId: { $in: folderIds }, ownerUserId },
        { session }
      );
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.hardDeleteNotesByFolderIds', err);
    }
  }

  /**
   * 여러 폴더에 속한 노트들을 일괄 복구한다.
   * @param folderIds 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구된 노트 수
   */
  async restoreNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (folderIds.length === 0) return 0;
      const result: UpdateResult<NoteDoc> = await this.notesCol().updateMany(
        { folderId: { $in: folderIds }, ownerUserId },
        { $set: { deletedAt: null, updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.restoreNotesByFolderIds', err);
    }
  }

  // --- Folder Operations ---

  /**
   * 폴더를 생성한다.
   */
  async createFolder(doc: FolderDoc, session?: ClientSession): Promise<FolderDoc> {
    try {
      await this.foldersCol().insertOne(doc, { session });
      return doc;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.createFolder', err);
    }
  }

  /**
   * ID로 폴더를 조회한다.
   */
  async getFolder(id: string, ownerUserId: string, includeDeleted: boolean = false): Promise<FolderDoc | null> {
    try {
      const filter: any = { _id: id, ownerUserId };
      if (!includeDeleted) {
        filter.deletedAt = null;
      }
      return this.foldersCol().findOne(filter);
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.getFolder', err);
    }
  }

  /**
   * 특정 폴더(또는 루트)의 하위 폴더 목록을 조회한다.
   */
  async listFolders(ownerUserId: string, parentId: string | null): Promise<FolderDoc[]> {
    try {
      return this.foldersCol().find({ ownerUserId, parentId, deletedAt: null }).toArray();
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.listFolders', err);
    }
  }

  /**
   * 폴더를 수정한다.
   */
  async updateFolder(
    id: string,
    ownerUserId: string,
    updates: Partial<FolderDoc>,
    session?: ClientSession
  ): Promise<FolderDoc | null> {
    try {
      const result: WithId<FolderDoc> | null = await this.foldersCol().findOneAndUpdate(
        { _id: id, ownerUserId, deletedAt: null },
        { $set: updates },
        { returnDocument: 'after', session }
      );
      return result;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.updateFolder', err);
    }
  }

  /**
   * 폴더를 삭제한다.
   */
  async deleteFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.foldersCol().deleteOne({ _id: id, ownerUserId }, { session });
      return result.deletedCount === 1;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteFolder', err);
    }
  }

  async deleteAllFolders(ownerUserId: string, session?: ClientSession): Promise<number> {
    try {
      const result = await this.foldersCol().deleteMany({ ownerUserId }, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteAllFolders', err);
    }
  }

  /**
   * 특정 폴더의 모든 하위 폴더 ID(자손 포함)를 조회한다.
   * - MongoDB Aggregation Pipeline의 `$graphLookup`을 사용한다.
   */
  async findDescendantFolderIds(rootFolderId: string, ownerUserId: string): Promise<string[]> {
    try {
      // $graphLookup을 사용하여 모든 하위 폴더를 재귀적으로 검색
      const pipeline: any[] = [
        { $match: { _id: rootFolderId, ownerUserId } },
        {
          $graphLookup: {
            from: 'folders',
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'parentId',
            as: 'descendants',
            restrictSearchWithMatch: { ownerUserId }, // 보안: 동일 소유자 내에서만 검색
          },
        },
        {
          $project: {
            descendantIds: '$descendants._id',
          },
        },
      ];

      const result: any[] = await this.foldersCol().aggregate(pipeline).toArray();
      if (result.length === 0) {
        return [];
      }
      return result[0].descendantIds || [];
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.findDescendantFolderIds', err);
    }
  }

  /**
   * 여러 폴더를 일괄 삭제한다.
   * @param ids 삭제할 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 폴더 수
   */
  async deleteFolders(
    ids: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (ids.length === 0) return 0;
      const result: DeleteResult = await this.foldersCol().deleteMany(
        { _id: { $in: ids }, ownerUserId },
        { session }
      );
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.deleteFolders', err);
    }
  }

  /**
   * 여러 폴더를 일괄 Soft Delete 한다.
   * @param ids 삭제할 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 업데이트된 폴더 수
   */
  async softDeleteFolders(
    ids: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (ids.length === 0) return 0;
      const result: UpdateResult<FolderDoc> = await this.foldersCol().updateMany(
        { _id: { $in: ids }, ownerUserId },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.softDeleteFolders', err);
    }
  }

  /**
   * 여러 폴더를 일괄 Hard Delete 한다.
   * @param ids 삭제할 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 폴더 수
   */
  async hardDeleteFolders(
    ids: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (ids.length === 0) return 0;
      const result: DeleteResult = await this.foldersCol().deleteMany(
        { _id: { $in: ids }, ownerUserId },
        { session }
      );
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.hardDeleteFolders', err);
    }
  }

  /**
   * 삭제된 폴더를 복구한다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구 성공 여부
   */
  async restoreFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.foldersCol().updateOne(
        { _id: id, ownerUserId },
        { $set: { deletedAt: null, updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.restoreFolder', err);
    }
  }

  /**
   * 여러 폴더를 일괄 복구한다.
   * @param ids 복구할 폴더 ID 배열
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구된 폴더 수
   */
  async restoreFolders(
    ids: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (ids.length === 0) return 0;
      const result: UpdateResult<FolderDoc> = await this.foldersCol().updateMany(
        { _id: { $in: ids }, ownerUserId },
        { $set: { deletedAt: null, updatedAt: new Date() } },
        { session }
      );
      return result.modifiedCount;
    } catch (err: unknown) {
      this.handleError('NoteRepositoryMongo.restoreFolders', err);
    }
  }

  private handleError(methodName: string, err: unknown): never {
    if (
      err instanceof Error &&
      ((err as any).hasErrorLabel?.('TransientTransactionError') ||
        (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
    ) {
      throw err;
    }
    throw new UpstreamError(`${methodName} failed`, { cause: String(err) });
  }
}
