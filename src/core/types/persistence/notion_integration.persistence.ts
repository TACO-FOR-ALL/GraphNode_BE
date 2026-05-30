/**
 * @description Prisma `notion_integrations` 도메인 타입.
 */
export interface NotionIntegrationRecord {
  id: string;
  userId: string;
  notionWorkspaceId: string;
  notionWorkspaceName: string | null;
  notionBotId: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
