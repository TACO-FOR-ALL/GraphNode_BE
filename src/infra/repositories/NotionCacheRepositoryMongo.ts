import { Collection } from 'mongodb';

import type { NotionCacheRepository } from '../../core/ports/NotionCacheRepository';
import type { NotionPageCacheDoc } from '../../core/types/persistence/notion_cache.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * @description Notion 페이지 캐시 MongoDB 구현체 (`notion_page_caches` 컬렉션).
 */
export class NotionCacheRepositoryMongo implements NotionCacheRepository {
  private col(): Collection<NotionPageCacheDoc> {
    return getMongo().db().collection<NotionPageCacheDoc>('notion_page_caches');
  }

  /**
   * @inheritdoc
   */
  async upsertPage(doc: NotionPageCacheDoc): Promise<NotionPageCacheDoc> {
    try {
      const now = new Date();
      const payload: NotionPageCacheDoc = {
        ...doc,
        updatedAt: now,
        createdAt: doc.createdAt ?? now,
        deletedAt: null,
      };
      await this.col().updateOne(
        { _id: doc._id, ownerUserId: doc.ownerUserId },
        { $set: payload },
        { upsert: true }
      );
      return payload;
    } catch (err: unknown) {
      throw new UpstreamError('NotionCacheRepositoryMongo.upsertPage failed', { cause: err });
    }
  }

  /**
   * @inheritdoc
   */
  async findByPageId(pageId: string, ownerUserId: string): Promise<NotionPageCacheDoc | null> {
    try {
      return await this.col().findOne({
        _id: pageId,
        ownerUserId,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      });
    } catch (err: unknown) {
      throw new UpstreamError('NotionCacheRepositoryMongo.findByPageId failed', { cause: err });
    }
  }

  /**
   * @inheritdoc
   */
  async findPagesModifiedSince(ownerUserId: string, since: Date): Promise<NotionPageCacheDoc[]> {
    try {
      return await this.col()
        .find({
          ownerUserId,
          updatedAt: { $gt: since },
          $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        })
        .toArray();
    } catch (err: unknown) {
      throw new UpstreamError('NotionCacheRepositoryMongo.findPagesModifiedSince failed', {
        cause: err,
      });
    }
  }

  /**
   * @inheritdoc
   */
  async softDeletePage(pageId: string, ownerUserId: string): Promise<void> {
    try {
      await this.col().updateOne(
        { _id: pageId, ownerUserId },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } }
      );
    } catch (err: unknown) {
      throw new UpstreamError('NotionCacheRepositoryMongo.softDeletePage failed', { cause: err });
    }
  }
}
