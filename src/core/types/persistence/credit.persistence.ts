/**
 * Core credit persistence types.
 *
 * Prisma remains an infra detail. Core services, ports, and config use these
 * stable domain-facing values so billing logic is not coupled to @prisma/client.
 */

/**
 * 플랜 타입 정의
 * @param FREE : 무료 플랜
 * @param PRO : 프로 플랜
 * @param ENTERPRISE : 엔터프라이즈 플랜
 */
export const PlanType = {
  FREE: 'FREE',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const;

/**
 * 플랜 타입 정의
 * @param FREE : 무료 플랜
 * @param PRO : 프로 플랜
 * @param ENTERPRISE : 엔터프라이즈 플랜
 */
export type PlanType = (typeof PlanType)[keyof typeof PlanType];

/**
 * 기능 타입 정의
 * @param AI_CHAT : AI 채팅 기능
 * @param GRAPH_GENERATION : 그래프 생성 기능
 * @param ADD_NODE : 노드 추가 기능
 * @param MICROSCOPE_INGEST : 현미경 기능
 */
export const CreditFeature = {
  AI_CHAT: 'AI_CHAT',
  GRAPH_GENERATION: 'GRAPH_GENERATION',
  ADD_NODE: 'ADD_NODE',
  MICROSCOPE_INGEST: 'MICROSCOPE_INGEST',
} as const;

/**
 * 기능 타입 정의
 * @param AI_CHAT : AI 채팅 기능
 * @param GRAPH_GENERATION : 그래프 생성 기능
 * @param ADD_NODE : 노드 추가 기능
 * @param MICROSCOPE_INGEST : 현미경 기능
 */
export type CreditFeature = (typeof CreditFeature)[keyof typeof CreditFeature];

/**
 * 트랜잭션 타입 정의
 * @param REFILL : 크레딧 충전
 * @param DEDUCT : 크레딧 차감
 * @param HOLD : 크레딧 홀드
 * @param COMMIT : 크레딧 커밋
 * @param ROLLBACK : 크레딧 롤백
 * @param REFUND : 크레딧 환불
 */
export const CreditTransactionType = {
  REFILL: 'REFILL',
  DEDUCT: 'DEDUCT',
  HOLD: 'HOLD',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  REFUND: 'REFUND',
} as const;

/**
 * 트랜잭션 타입 정의
 * @param REFILL : 크레딧 충전
 * @param DEDUCT : 크레딧 차감
 * @param HOLD : 크레딧 홀드
 * @param COMMIT : 크레딧 커밋
 * @param ROLLBACK : 크레딧 롤백
 * @param REFUND : 크레딧 환불
 */
export type CreditTransactionType =
  (typeof CreditTransactionType)[keyof typeof CreditTransactionType];

/**
 * AI Credit balance record
 * @param id : 잔액 고유 ID
 * @param userId : 유저 ID
 * @param balance : 잔액
 * @param holdAmount : 홀드 금액
 * @param planType : 플랜 타입
 * @param cycleStart : 사이클 시작 시간
 * @param cycleEnd : 사이클 종료 시간
 * @param updatedAt : 업데이트 시간
 */
export interface CreditBalanceRecord {
  id: string;
  userId: string;
  balance: number;
  holdAmount: number;
  planType: PlanType;
  cycleStart: Date;
  cycleEnd: Date;
  updatedAt: Date;
}

/**
 *  AI Credit Transaction 기록 타입
 * @param id : 트랜잭션 고유 ID
 * @param userId : 유저 ID
 * @param type : 트랜잭션 타입
 * @param feature : 기능 타입
 * @param amount : 트랜잭션 금액
 * @param taskId : task 고유 ID
 * @param expiresAt : 만료 시간
 */
export interface CreditTransactionRecord {
  id: string;
  userId: string;
  type: CreditTransactionType;
  feature: CreditFeature | null;
  amount: number;
  taskId: string | null;
  expiresAt: Date | null;
}
