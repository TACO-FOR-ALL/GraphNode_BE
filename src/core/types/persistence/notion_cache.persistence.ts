/**
 * @description Notion 페이지 블록 캐시 MongoDB Document 타입.
 */

/**
 * @description AI·Graph 파이프라인용 블록 트리 노드 (텍스트 블록만 저장).
 */
export interface NotionBlockTreeNode {
  id: string;
  type: string;
  text?: string;
  depth: number;
  children: NotionBlockTreeNode[];
}

/**
 * @description MongoDB `notion_page_caches` 컬렉션 문서.
 */
export interface NotionPageCacheDoc {
  /** Notion page ID (UUID) */
  _id: string;
  ownerUserId: string;
  integrationId: string;
  notionWorkspaceId: string;
  title: string;
  blockTree: NotionBlockTreeNode[];
  plainText: string;
  notionLastEditedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  /** @description 웹훅 수신 시 true로 마킹되며, 조회 시 최신화 트리거로 사용됨 */
  isStale?: boolean;
}
