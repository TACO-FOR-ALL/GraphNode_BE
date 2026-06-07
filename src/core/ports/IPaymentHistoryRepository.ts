/**
 * @module IPaymentHistoryRepository
 * @description 결제 내역 불변 원장에 대한 Core Port 인터페이스.
 * 구현체는 src/infra/repositories/PaymentHistoryRepository.ts 에 위치합니다.
 */

import type {
  PaymentHistoryRow,
  CreatePaymentHistoryDto,
} from '../types/persistence/subscription.persistence';

/**
 * 결제 내역 저장소 포트 인터페이스.
 */
export interface IPaymentHistoryRepository {
  /**
   * 결제 내역 row를 생성합니다 (append-only).
   * @param dto 생성에 필요한 결제 데이터
   * @returns 생성된 결제 내역 row
   */
  create(dto: CreatePaymentHistoryDto): Promise<PaymentHistoryRow>;

  /**
   * idempotencyKey로 결제 내역을 조회합니다 (중복 결제 방지).
   * @param key 서버 생성 UUID 멱등성 키
   * @returns 결제 내역 row 또는 null
   */
  findByIdempotencyKey(key: string): Promise<PaymentHistoryRow | null>;

  /**
   * 사용자의 결제 내역을 최신순으로 조회합니다.
   * @param userId 사용자 ID
   * @param limit  최대 조회 건수 (기본 20)
   * @returns 결제 내역 배열
   */
  findByUserId(userId: string, limit?: number): Promise<PaymentHistoryRow[]>;
}
