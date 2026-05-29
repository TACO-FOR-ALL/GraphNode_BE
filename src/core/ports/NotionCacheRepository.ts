import type { NotionPageCacheDoc } from '../types/persistence/notion_cache.persistence';

/**
 * @description Notion 페이지 블록 캐시 MongoDB 포트.
 */
export interface NotionCacheRepository {
  upsertPage(doc: NotionPageCacheDoc): Promise<NotionPageCacheDoc>;

  findByPageId(pageId: string, ownerUserId: string): Promise<NotionPageCacheDoc | null>;

  findPagesModifiedSince(ownerUserId: string, since: Date): Promise<NotionPageCacheDoc[]>;

  softDeletePage(pageId: string, ownerUserId: string): Promise<void>;

  /** @description 웹훅 수신 시 특정 페이지를 isStale 상태로 마킹합니다. */
  markAsStale(pageId: string, ownerUserId: string): Promise<void>;

  /** @description 갱신 대기 중인(isStale=true) 특정 사용자의 페이지 목록을 조회합니다. */
  findStalePages(ownerUserId: string): Promise<NotionPageCacheDoc[]>;
}
