import { Collection } from 'mongodb';

import { UserFileRepository } from '../../core/ports/UserFileRepository';
import { UserFileDoc } from '../../core/types/persistence/userFile.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * MongoDB `user_files` 컬렉션 구현체.
 *
 * - 삭제되지 않은 문서는 `deletedAt`이 날짜 타입이 아닌 경우로 조회한다(노트 컬렉션과 동일 패턴).
 * - 목록 커서는 `updatedAt`의 epoch 밀리초 문자열을 사용한다.
 */
export class UserFileRepositoryMongo implements UserFileRepository {
  private col(): Collection<UserFileDoc> {
    return getMongo().db().collection<UserFileDoc>('user_files');
  }

  async insert(doc: UserFileDoc): Promise<UserFileDoc> {
    try {
      const now = new Date();
      doc.createdAt = now;
      doc.updatedAt = now;
      doc.deletedAt = doc.deletedAt ?? null;
      await this.col().insertOne(doc);
      return doc;
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.insert', err);
    }
  }

  async getById(id: string, ownerUserId: string, includeDeleted = false): Promise<UserFileDoc | null> {
    try {
      const filter: Record<string, unknown> = { _id: id, ownerUserId };
      if (!includeDeleted) {
        filter.deletedAt = { $not: { $type: 'date' } };
      }
      return this.col().findOne(filter);
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.getById', err);
    }
  }

  async listFiles(
    ownerUserId: string,
    folderId: string | null,
    limit: number,
    cursor?: string
  ): Promise<{ items: UserFileDoc[]; nextCursor: string | null }> {
    try {
      const query: Record<string, unknown> = {
        ownerUserId,
        folderId,
        deletedAt: { $not: { $type: 'date' } },
      };
      if (cursor) {
        query.updatedAt = { $lt: new Date(parseInt(cursor, 10)) };
      }
      const items = await this.col()
        .find(query)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
      const last = items[items.length - 1];
      const nextCursor =
        items.length === limit && last?.updatedAt ? String(last.updatedAt.getTime()) : null;
      return { items, nextCursor };
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.listFiles', err);
    }
  }

  async listActiveDisplayNamesInFolder(
    ownerUserId: string,
    folderId: string | null
  ): Promise<string[]> {
    try {
      const rows = await this.col()
        .find(
          { ownerUserId, folderId, deletedAt: { $not: { $type: 'date' } } },
          { projection: { displayName: 1 } }
        )
        .toArray();
      return rows.map((r) => r.displayName);
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.listActiveDisplayNamesInFolder', err);
    }
  }

  async updateById(
    id: string,
    ownerUserId: string,
    patch: Partial<UserFileDoc>
  ): Promise<UserFileDoc | null> {
    try {
      const { updatedAt: _u, createdAt: _c, ...rest } = patch;
      const result = await this.col().findOneAndUpdate(
        { _id: id, ownerUserId, deletedAt: { $not: { $type: 'date' } } },
        { $set: { ...rest, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      return result;
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.updateById', err);
    }
  }

  async softDelete(id: string, ownerUserId: string): Promise<boolean> {
    try {
      const r = await this.col().updateOne(
        { _id: id, ownerUserId, deletedAt: { $not: { $type: 'date' } } },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } }
      );
      return r.modifiedCount === 1;
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.softDelete', err);
    }
  }

  async hardDelete(id: string, ownerUserId: string): Promise<boolean> {
    try {
      const r = await this.col().deleteOne({ _id: id, ownerUserId });
      return r.deletedCount === 1;
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.hardDelete', err);
    }
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<UserFileDoc[]> {
    try {
      return await this.col()
        .find({
          ownerUserId,
          deletedAt: { $not: { $type: 'date' } },
          updatedAt: { $gt: since },
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.findModifiedSince', err);
    }
  }

  async listAllActive(ownerUserId: string): Promise<UserFileDoc[]> {
    try {
      return await this.col()
        .find({ ownerUserId, deletedAt: { $not: { $type: 'date' } } })
        .toArray();
    } catch (err: unknown) {
      this.handleError('UserFileRepositoryMongo.listAllActive', err);
    }
  }

  private handleError(methodName: string, err: unknown): never {
    throw new UpstreamError(`${methodName} failed`, { cause: String(err) });
  }
}
