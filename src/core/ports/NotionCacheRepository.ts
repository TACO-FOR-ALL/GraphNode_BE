import type { NotionPageCacheDoc } from '../types/persistence/notion_cache.persistence';

/**
 * @description Notion 페이지 블록 캐시 MongoDB 포트.
 */
export interface NotionCacheRepository {
  upsertPage(doc: NotionPageCacheDoc): Promise<NotionPageCacheDoc>;

  findByPageId(pageId: string, ownerUserId: string): Promise<NotionPageCacheDoc | null>;

  findPagesModifiedSince(ownerUserId: string, since: Date): Promise<NotionPageCacheDoc[]>;

  softDeletePage(pageId: string, ownerUserId: string): Promise<void>;
}
