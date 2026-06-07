/**
 * @module IUserPaymentMethodRepository
 * @description PG사별 billingKey 저장소에 대한 Core Port 인터페이스.
 * 구현체는 src/infra/repositories/UserPaymentMethodRepository.ts 에 위치합니다.
 */

import type {
  UserPaymentMethodRow,
  CreateUserPaymentMethodDto,
} from '../types/persistence/subscription.persistence';

/**
 * 결제 수단(billingKey) 저장소 포트 인터페이스.
 */
export interface IUserPaymentMethodRepository {
  /**
   * 결제 수단을 생성합니다.
   * @param dto 생성 데이터
   * @returns 생성된 결제 수단 row
   */
  create(dto: CreateUserPaymentMethodDto): Promise<UserPaymentMethodRow>;

  /**
   * 사용자의 기본(isDefault=true) 결제 수단을 조회합니다.
   * @param userId 사용자 ID
   * @returns 기본 결제 수단 row 또는 null
   */
  findDefaultByUserId(userId: string): Promise<UserPaymentMethodRow | null>;

  /**
   * 사용자의 모든 결제 수단을 조회합니다 (최신순).
   * @param userId 사용자 ID
   * @returns 결제 수단 row 배열
   */
  findByUserId(userId: string): Promise<UserPaymentMethodRow[]>;

  /**
   * ID로 결제 수단 단건을 조회합니다.
   * @param id 결제 수단 ID
   * @returns 결제 수단 row 또는 null
   */
  findById(id: string): Promise<UserPaymentMethodRow | null>;
}
