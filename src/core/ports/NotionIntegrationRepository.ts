import type { NotionIntegrationRecord } from '../types/persistence/notion_integration.persistence';

/**
 * @description Notion OAuth 연동(워크스페이스별 토큰) 영속화 포트.
 */
export interface NotionIntegrationRepository {
  upsertByUserAndWorkspace(
    data: Omit<NotionIntegrationRecord, 'createdAt' | 'updatedAt'> & {
      createdAt?: Date;
      updatedAt?: Date;
    }
  ): Promise<NotionIntegrationRecord>;

  findById(id: string): Promise<NotionIntegrationRecord | null>;

  findByUserId(userId: string): Promise<NotionIntegrationRecord[]>;

  findByNotionWorkspaceId(notionWorkspaceId: string): Promise<NotionIntegrationRecord[]>;

  findByUserAndWorkspace(
    userId: string,
    notionWorkspaceId: string
  ): Promise<NotionIntegrationRecord | null>;
}
