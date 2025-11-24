import { Collection, ClientSession } from 'mongodb';
import { NoteRepository } from '../../core/ports/NoteRepository';
import { NoteDoc, FolderDoc } from '../../core/types/persistence/note.persistence';
import { getMongo } from '../db/mongodb';

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
   */
  async createNote(doc: NoteDoc, session?: ClientSession): Promise<NoteDoc> {
    await this.notesCol().insertOne(doc, { session });
    return doc;
  }

  /**
   * ID로 노트를 조회한다.
   */
  async getNote(id: string, ownerUserId: string): Promise<NoteDoc | null> {
    return this.notesCol().findOne({ _id: id, ownerUserId });
  }

  /**
   * 특정 폴더(또는 루트)의 노트 목록을 조회한다.
   */
  async listNotes(ownerUserId: string, folderId: string | null): Promise<NoteDoc[]> {
    return this.notesCol().find({ ownerUserId, folderId }).toArray();
  }

  /**
   * 노트를 수정한다.
   */
  async updateNote(id: string, ownerUserId: string, updates: Partial<NoteDoc>, session?: ClientSession): Promise<NoteDoc | null> {
    const result = await this.notesCol().findOneAndUpdate(
      { _id: id, ownerUserId },
      { $set: updates },
      { returnDocument: 'after', session }
    );
    return result;
  }

  /**
   * 노트를 삭제한다.
   */
  async deleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const result = await this.notesCol().deleteOne({ _id: id, ownerUserId }, { session });
    return result.deletedCount === 1;
  }

  /**
   * 여러 폴더에 속한 노트들을 일괄 삭제한다.
   */
  async deleteNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    if (folderIds.length === 0) return 0;
    const result = await this.notesCol().deleteMany(
      { folderId: { $in: folderIds }, ownerUserId },
      { session }
    );
    return result.deletedCount;
  }

  // --- Folder Operations ---

  /**
   * 폴더를 생성한다.
   */
  async createFolder(doc: FolderDoc, session?: ClientSession): Promise<FolderDoc> {
    await this.foldersCol().insertOne(doc, { session });
    return doc;
  }

  /**
   * ID로 폴더를 조회한다.
   */
  async getFolder(id: string, ownerUserId: string): Promise<FolderDoc | null> {
    return this.foldersCol().findOne({ _id: id, ownerUserId });
  }

  /**
   * 특정 폴더(또는 루트)의 하위 폴더 목록을 조회한다.
   */
  async listFolders(ownerUserId: string, parentId: string | null): Promise<FolderDoc[]> {
    return this.foldersCol().find({ ownerUserId, parentId }).toArray();
  }

  /**
   * 폴더를 수정한다.
   */
  async updateFolder(id: string, ownerUserId: string, updates: Partial<FolderDoc>, session?: ClientSession): Promise<FolderDoc | null> {
    const result = await this.foldersCol().findOneAndUpdate(
      { _id: id, ownerUserId },
      { $set: updates },
      { returnDocument: 'after', session }
    );
    return result;
  }

  /**
   * 폴더를 삭제한다.
   */
  async deleteFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const result = await this.foldersCol().deleteOne({ _id: id, ownerUserId }, { session });
    return result.deletedCount === 1;
  }

  /**
   * 특정 폴더의 모든 하위 폴더 ID(자손 포함)를 조회한다.
   * - MongoDB Aggregation Pipeline의 `$graphLookup`을 사용한다.
   */
  async findDescendantFolderIds(rootFolderId: string, ownerUserId: string): Promise<string[]> {
    // $graphLookup을 사용하여 모든 하위 폴더를 재귀적으로 검색
    const pipeline = [
      { $match: { _id: rootFolderId, ownerUserId } },
      {
        $graphLookup: {
          from: 'folders',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentId',
          as: 'descendants',
          restrictSearchWithMatch: { ownerUserId } // 보안: 동일 소유자 내에서만 검색
        }
      },
      {
        $project: {
          descendantIds: '$descendants._id'
        }
      }
    ];

    const result = await this.foldersCol().aggregate(pipeline).toArray();
    if (result.length === 0) {
      return [];
    }
    return result[0].descendantIds || [];
  }

  /**
   * 여러 폴더를 일괄 삭제한다.
   */
  async deleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.foldersCol().deleteMany(
      { _id: { $in: ids }, ownerUserId },
      { session }
    );
    return result.deletedCount;
  }
}
