/**
 * 모듈: ICreditRepository (크레딧 영속성 포트)
 *
 * 책임:
 * - CreditService 가 사용하는 데이터 접근 인터페이스를 정의합니다.
 * - 구현체는 src/infra/repositories/CreditRepositoryPrisma.ts 에 위치합니다.
 */

import type {
  CreditBalanceRecord,
  CreditFeature,
  CreditTransactionRecord,
  PlanType,
} from '../types/persistence/credit.persistence';

export type CreditBalanceRow = CreditBalanceRecord;
export type CreditTransactionRow = CreditTransactionRecord;

export interface ICreditRepository {
  /**
   * userId 로 크레딧 잔액을 조회합니다.
   * @param userId : 유저 ID
   * @returns 잔액 행 또는 null (최초 가입 전)
   */
  findBalanceByUserId(userId: string): Promise<CreditBalanceRow | null>;

  /**
   * 새 크레딧 잔액 행을 생성합니다 (신규 사용자 lazy init).
   * @param userId : 유저 ID
   * @param balance : 잔액
   * @param planType : 플랜 타입
   * @param cycleStart : 사이클 시작 시간
   * @param cycleEnd : 사이클 종료 시간
   */
  createBalance(params: {
    userId: string;
    balance: number;
    planType: PlanType;
    cycleStart: Date;
    cycleEnd: Date;
  }): Promise<CreditBalanceRow>;

  /**
   * 크레딧 즉시 차감 (동기 작업용).
   * balance 를 cost 만큼 감소시키고 DEDUCT 트랜잭션을 기록합니다.
   * race condition 방지를 위해 DB 트랜잭션 + 잔액 검증을 내부적으로 수행합니다.
   * @param userId : 유저 ID
   * @param cost : 차감할 크레딧
   * @param feature : 기능 타입
   * @param description : 설명
   * @returns 차감 후 잔액
   * @throws 잔액 부족 시 절대 호출자에게 에러를 던지지 않고 false 를 반환 — 판단은 서비스 레이어가
   */
  deductBalance(params: {
    userId: string;
    cost: number;
    feature: CreditFeature;
    description?: string;
  }): Promise<{ success: boolean; availableAfter: number }>;

  /**
   * 비동기 작업 크레딧 에스크로 (hold).
   * holdAmount 를 cost 만큼 증가시키고 HOLD 트랜잭션(taskId 포함)을 기록합니다.
   * @param userId : 유저 ID
   * @param cost : 홀드할 크레딧
   * @param feature : 기능 타입
   * @param taskId : task 고유 ID
   * @param expiresAt : 만료 시간
   * @returns 홀드 후 잔액
   */
  holdBalance(params: {
    userId: string;
    cost: number;
    feature: CreditFeature;
    taskId: string;
    expiresAt: Date;
  }): Promise<{ success: boolean; availableAfter: number }>;

  /**
   * HOLD 확정 (비동기 작업 성공).
   * balance -= cost, holdAmount -= cost, COMMIT 트랜잭션 기록.
   * @param taskId : task 고유 ID
   * @returns taskId 에 해당하는 HOLD 가 없으면 false (idempotent)
   */
  commitHold(taskId: string): Promise<boolean>;

  /**
   * HOLD 해제 (비동기 작업 실패).
   * holdAmount -= cost, balance 변경 없음, ROLLBACK 트랜잭션 기록.
   * @param taskId : task 고유 ID
   * @returns taskId 에 해당하는 HOLD 가 없으면 false (idempotent)
   */
  rollbackHold(taskId: string): Promise<boolean>;

  /**
   * 크레딧 환불 (동기 작업 AI 실패 시).
   * balance += amount, REFUND 트랜잭션 기록.
   * @param userId : 유저 ID
   * @param amount : 환불할 크레딧
   * @param description : 설명
   */
  refundBalance(params: { userId: string; amount: number; description: string }): Promise<void>;

  /**
   * 구독 갱신 — balance 를 planLimit 으로 초기화하고 holdAmount 를 0 으로 리셋.
   * REFILL 트랜잭션 기록, cycleStart/cycleEnd 갱신.
   * @param userId : 유저 ID
   * @param planLimit : 플랜 제한
   * @param planType : 플랜 타입
   * @param cycleStart : 사이클 시작 시간
   * @param cycleEnd : 사이클 종료 시간
   */
  refillBalance(params: {
    userId: string;
    planLimit: number;
    planType: PlanType;
    cycleStart: Date;
    cycleEnd: Date;
  }): Promise<void>;

  /**
   * cycleEnd < now 인 모든 사용자를 반환합니다 (배치 갱신용).
   * @param now : 현재 시간
   * @returns cycleEnd < now 인 모든 사용자
   */
  findUsersWithExpiredCycle(now: Date): Promise<Array<{ userId: string; planType: PlanType }>>;

  /**
   * expiresAt < now 인 HOLD 트랜잭션을 반환합니다 (stale hold 정리용).
   * @param now : 현재 시간
   * @returns expiresAt < now 인 모든 HOLD 트랜잭션
   */
  findExpiredHolds(now: Date): Promise<CreditTransactionRow[]>;

  /**
   * taskId 에 해당하는 HOLD 트랜잭션을 조회합니다.
   * @param taskId : task 고유 ID
   * @returns taskId 에 해당하는 HOLD 트랜잭션
   */
  findHoldByTaskId(taskId: string): Promise<CreditTransactionRow | null>;

  /**
   * UsageLog 를 기록합니다.
   * @param userId : 유저 ID
   * @param feature : 기능 타입
   * @param taskId : task 고유 ID
   * @param creditUsed : 사용한 크레딧
   * @param status : 상태
   */
  createUsageLog(params: {
    userId: string;
    feature: CreditFeature;
    taskId: string | null;
    creditUsed: number;
    status: 'SUCCESS' | 'FAILED';
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * 사용 내역(UsageLog)을 최신순으로 페이지네이션 조회합니다.
   * @param userId : 유저 ID
   * @param limit  : 최대 조회 수 (기본 20)
   * @param offset : 오프셋 (기본 0)
   * @returns 사용 내역 목록과 전체 개수
   */
  findUsageLogs(params: {
    userId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Array<{
    id: string;
    feature: CreditFeature;
    creditUsed: number;
    status: 'SUCCESS' | 'FAILED';
    taskId: string | null;
    createdAt: Date;
  }>; total: number }>;
}
