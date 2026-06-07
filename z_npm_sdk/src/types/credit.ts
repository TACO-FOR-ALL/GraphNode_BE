/**
 * Credit SDK 타입 정의
 * @packageDocumentation
 */

/** 플랜 타입 */
export type CreditPlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

/** 크레딧 사용 기능 타입 */
export type CreditFeatureType =
  | 'AI_CHAT'
  | 'GRAPH_GENERATION'
  | 'ADD_NODE'
  | 'MICROSCOPE_INGEST';

/**
 * GET /v1/me/credits 응답 DTO
 *
 * @property balance          현재 보유 크레딧 (총량)
 * @property holdAmount       에스크로 중인 크레딧 (비동기 작업 진행 중 예약된 금액)
 * @property availableBalance 실제 사용 가능한 크레딧 (balance - holdAmount)
 * @property planType         구독 플랜
 * @property cycleStart       현재 청구 주기 시작 일시 (ISO 8601)
 * @property cycleEnd         현재 청구 주기 종료 일시 (ISO 8601)
 */
export interface CreditBalanceDto {
  balance: number;
  holdAmount: number;
  availableBalance: number;
  planType: CreditPlanType;
  cycleStart: string;
  cycleEnd: string;
}

/**
 * 단일 크레딧 사용 내역 항목
 *
 * @property id         UsageLog ID
 * @property feature    사용된 기능
 * @property creditUsed 사용한 크레딧 수
 * @property status     결과 상태 ('SUCCESS' | 'FAILED')
 * @property taskId     비동기 작업 ID (동기 작업이면 null)
 * @property createdAt  사용 일시 (ISO 8601)
 */
export interface CreditUsageItemDto {
  id: string;
  feature: CreditFeatureType;
  creditUsed: number;
  status: 'SUCCESS' | 'FAILED';
  taskId: string | null;
  createdAt: string;
}

/**
 * GET /v1/me/credits/usage 응답 DTO
 *
 * @property items 사용 내역 목록 (최신순)
 * @property total 전체 항목 수
 */
export interface CreditUsageDto {
  items: CreditUsageItemDto[];
  total: number;
}
