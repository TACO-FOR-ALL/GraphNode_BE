/**
 * @module ISubscriptionRepository
 * @description 구독 상태 원장에 대한 Core Port 인터페이스.
 * 구현체는 src/infra/repositories/SubscriptionRepository.ts 에 위치합니다.
 */

import type {
  SubscriptionRow,
  CreateSubscriptionDto,
  UpdateSubscriptionStatusDto,
} from '../types/persistence/subscription.persistence';

/**
 * 구독 저장소 포트 인터페이스.
 * SubscriptionService는 이 인터페이스만 의존하며 infra 구현체를 직접 import하지 않습니다.
 */
export interface ISubscriptionRepository {
  /**
   * 사용자의 현재 활성(ACTIVE) 구독을 조회합니다.
   * @param userId 사용자 ID
   * @returns 활성 구독 row 또는 null (FREE이거나 아직 없음)
   */
  findActiveByUserId(userId: string): Promise<SubscriptionRow | null>;

  /**
   * 새 구독 row를 생성합니다.
   * @param dto 생성에 필요한 구독 데이터
   * @returns 생성된 구독 row
   */
  create(dto: CreateSubscriptionDto): Promise<SubscriptionRow>;

  /**
   * 구독의 status와 관련 시간 필드를 업데이트합니다.
   * @param dto 업데이트 대상 ID와 변경 값
   * @returns 업데이트된 구독 row
   * @throws {NotFoundError} 해당 ID의 구독이 없을 때
   */
  updateStatus(dto: UpdateSubscriptionStatusDto): Promise<SubscriptionRow>;

  /**
   * ID로 구독 단건을 조회합니다.
   * @param id 구독 ID
   * @returns 구독 row 또는 null
   */
  findById(id: string): Promise<SubscriptionRow | null>;

  /**
   * 사용자의 모든 구독을 최신순으로 조회합니다.
   * @param userId 사용자 ID
   * @returns 구독 row 배열 (없으면 빈 배열)
   */
  findByUserId(userId: string): Promise<SubscriptionRow[]>;

  /**
   * 사용자의 PENDING 상태 구독을 조회합니다.
   * @param userId 사용자 ID
   * @returns PENDING 구독 row 또는 null
   */
  findPendingByUserId(userId: string): Promise<SubscriptionRow | null>;
}
