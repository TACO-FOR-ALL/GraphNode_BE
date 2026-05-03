/**
 * 모듈: Credit DTOs (크레딧 API 응답 타입)
 *
 * 책임:
 * - GET /v1/me/credits       → CreditBalanceResponseDto
 * - GET /v1/me/credits/usage → CreditUsageResponseDto
 *
 * 주의: CreditFeature, PlanType은 DB/내부 enum과 동일한 문자열을 그대로 사용합니다.
 */

/** 플랜 타입 */
export type CreditPlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

/** 크레딧 기능 타입 */
export type CreditFeatureType =
  | 'AI_CHAT'
  | 'GRAPH_GENERATION'
  | 'ADD_NODE'
  | 'MICROSCOPE_INGEST';

/**
 * GET /v1/me/credits 응답 DTO
 *
 * @property balance        현재 보유 크레딧 (사용 전 총량)
 * @property holdAmount     에스크로 중인 크레딧 (비동기 작업 진행 중)
 * @property availableBalance 실제 사용 가능한 크레딧 (= balance - holdAmount)
 * @property planType       구독 플랜 ('FREE' | 'PRO' | 'ENTERPRISE')
 * @property cycleStart     현재 청구 주기 시작 일시 (ISO 8601)
 * @property cycleEnd       현재 청구 주기 종료 일시 (ISO 8601)
 */
export interface CreditBalanceResponseDto {
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
 * @property feature    사용된 기능 ('AI_CHAT' | 'GRAPH_GENERATION' | ...)
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
 * @property items   사용 내역 목록 (최신순)
 * @property total   전체 항목 수
 */
export interface CreditUsageResponseDto {
  items: CreditUsageItemDto[];
  total: number;
}
