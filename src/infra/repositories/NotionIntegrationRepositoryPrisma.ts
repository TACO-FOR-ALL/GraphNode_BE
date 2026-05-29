import { v4 as uuidv4 } from 'uuid';

import type { NotionIntegrationRepository } from '../../core/ports/NotionIntegrationRepository';
import type { NotionIntegrationRecord } from '../../core/types/persistence/notion_integration.persistence';
import prisma from '../db/prisma';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * @description Notion OAuth 연동 Prisma 구현체.
 */
export class NotionIntegrationRepositoryPrisma implements NotionIntegrationRepository {
  /**
   * @description Prisma row → 도메인 레코드.
   */
  private mapRow(row: {
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
  }): NotionIntegrationRecord {
    return {
      id: row.id,
      userId: row.userId,
      notionWorkspaceId: row.notionWorkspaceId,
      notionWorkspaceName: row.notionWorkspaceName,
      notionBotId: row.notionBotId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenType: row.tokenType,
      tokenExpiresAt: row.tokenExpiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * @inheritdoc
   */
  async upsertByUserAndWorkspace(
    data: Omit<NotionIntegrationRecord, 'createdAt' | 'updatedAt'> & {
      createdAt?: Date;
      updatedAt?: Date;
    }
  ): Promise<NotionIntegrationRecord> {
    try {
      const row = await prisma.notionIntegration.upsert({
        where: {
          userId_notionWorkspaceId: {
            userId: data.userId,
            notionWorkspaceId: data.notionWorkspaceId,
          },
        },
        create: {
          id: data.id || uuidv4(),
          userId: data.userId,
          notionWorkspaceId: data.notionWorkspaceId,
          notionWorkspaceName: data.notionWorkspaceName,
          notionBotId: data.notionBotId,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenType: data.tokenType,
          tokenExpiresAt: data.tokenExpiresAt,
        },
        update: {
          notionWorkspaceName: data.notionWorkspaceName,
          notionBotId: data.notionBotId,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenType: data.tokenType,
          tokenExpiresAt: data.tokenExpiresAt,
        },
      });
      return this.mapRow(row);
    } catch (err: unknown) {
      throw new UpstreamError('Failed to upsert Notion integration', { cause: err });
    }
  }

  /**
   * @inheritdoc
   */
  async findById(id: string): Promise<NotionIntegrationRecord | null> {
    const row = await prisma.notionIntegration.findUnique({ where: { id } });
    return row ? this.mapRow(row) : null;
  }

  /**
   * @inheritdoc
   */
  async findByUserId(userId: string): Promise<NotionIntegrationRecord[]> {
    const rows = await prisma.notionIntegration.findMany({ where: { userId } });
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * @inheritdoc
   */
  async findByNotionWorkspaceId(notionWorkspaceId: string): Promise<NotionIntegrationRecord[]> {
    const rows = await prisma.notionIntegration.findMany({ where: { notionWorkspaceId } });
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * @inheritdoc
   */
  async findByUserAndWorkspace(
    userId: string,
    notionWorkspaceId: string
  ): Promise<NotionIntegrationRecord | null> {
    const row = await prisma.notionIntegration.findUnique({
      where: { userId_notionWorkspaceId: { userId, notionWorkspaceId } },
    });
    return row ? this.mapRow(row) : null;
  }
}
