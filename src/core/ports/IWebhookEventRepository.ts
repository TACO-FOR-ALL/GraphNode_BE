/**
 * @module IWebhookEventRepository
 * @description PG사 Webhook 이벤트 수신 원장에 대한 Core Port 인터페이스.
 * 구현체는 src/infra/repositories/WebhookEventRepository.ts 에 위치합니다.
 */

import type {
  WebhookEventRow,
  CreateWebhookEventDto,
  UpdateWebhookEventStatusDto,
} from '../types/persistence/subscription.persistence';

/**
 * Webhook 이벤트 저장소 포트 인터페이스.
 */
export interface IWebhookEventRepository {
  /**
   * Webhook 이벤트 row를 생성합니다 (append-only).
   * @param dto 생성에 필요한 이벤트 데이터
   * @returns 생성된 이벤트 row
   */
  create(dto: CreateWebhookEventDto): Promise<WebhookEventRow>;

  /**
   * idempotencyKey로 이벤트를 조회합니다 (중복 이벤트 처리 방지).
   * @param key PG사 고유 이벤트 ID
   * @returns 이벤트 row 또는 null
   */
  findByIdempotencyKey(key: string): Promise<WebhookEventRow | null>;

  /**
   * 이벤트 처리 결과(status, processedAt, errorMessage)를 업데이트합니다.
   * @param dto 업데이트 대상 ID와 변경 값
   * @returns 업데이트된 이벤트 row
   * @throws {NotFoundError} 해당 ID의 이벤트가 없을 때
   */
  updateStatus(dto: UpdateWebhookEventStatusDto): Promise<WebhookEventRow>;
}
