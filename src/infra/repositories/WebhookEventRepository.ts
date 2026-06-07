/**
 * @module WebhookEventRepository
 * @description Prisma(PostgreSQL) 기반 IWebhookEventRepository 구현체.
 */

import prisma from '../db/prisma';
import type { IWebhookEventRepository } from '../../core/ports/IWebhookEventRepository';
import type {
  WebhookEventRow,
  CreateWebhookEventDto,
  UpdateWebhookEventStatusDto,
} from '../../core/types/persistence/subscription.persistence';
import { NotFoundError } from '../../shared/errors/domain';

/**
 * `webhook_events` 테이블에 접근하는 Prisma 기반 저장소 구현체.
 *
 * @implements {IWebhookEventRepository}
 */
export class WebhookEventRepository implements IWebhookEventRepository {
  /**
   * Webhook 이벤트 row를 생성합니다 (append-only).
   * @param dto 이벤트 생성 데이터
   * @returns 생성된 이벤트 row
   */
  async create(dto: CreateWebhookEventDto): Promise<WebhookEventRow> {
    const row = await prisma.webhookEvent.create({
      data: {
        provider:       dto.provider,
        eventType:      dto.eventType,
        idempotencyKey: dto.idempotencyKey,
        rawPayload:     dto.rawPayload as any,
        status:         dto.status,
      },
    });
    return row as unknown as WebhookEventRow;
  }

  /**
   * idempotencyKey로 이벤트를 조회합니다.
   * @param key PG사 고유 이벤트 ID
   * @returns 이벤트 row 또는 null
   */
  async findByIdempotencyKey(key: string): Promise<WebhookEventRow | null> {
    const row = await prisma.webhookEvent.findUnique({
      where: { idempotencyKey: key },
    });
    return row as unknown as WebhookEventRow | null;
  }

  /**
   * 이벤트 처리 결과를 업데이트합니다.
   * @param dto 업데이트 데이터
   * @returns 업데이트된 이벤트 row
   * @throws {NotFoundError} 해당 ID의 이벤트가 없을 때
   */
  async updateStatus(dto: UpdateWebhookEventStatusDto): Promise<WebhookEventRow> {
    const existing = await prisma.webhookEvent.findUnique({ where: { id: dto.id } });
    if (!existing) throw new NotFoundError(`WebhookEvent not found: ${dto.id}`);

    const row = await prisma.webhookEvent.update({
      where: { id: dto.id },
      data: {
        status:       dto.status,
        processedAt:  dto.processedAt ?? undefined,
        errorMessage: dto.errorMessage ?? undefined,
      },
    });
    return row as unknown as WebhookEventRow;
  }
}
