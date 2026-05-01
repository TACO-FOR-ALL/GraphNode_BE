/**
 * 모듈: billing.config (크레딧 정책 중앙 설정)
 *
 * 책임:
 * - 기능별 크레딧 소모량 정의 (CreditCostCalculator 전략 패턴)
 * - 플랜별 크레딧 한도 정의
 * - 크레딧 관련 공통 상수 정의
 *
 * 확장 가이드:
 * - 새 기능 추가: FEATURE_COSTS 에 항목 1개 추가, CreditService 변경 불필요
 * - 가변 요금제 전환: FixedCostCalculator → TokenBasedCostCalculator 교체
 */

import { CreditFeature, PlanType } from '../core/types/persistence/credit.persistence';

/**
 * 크레딧 계산 시 전달되는 컨텍스트 (현재는 선택적, 향후 가변 요금제 대비)
 * @param messageLength AI 채팅: 사용자 메시지 길이 (문자 수)
 * @param attachmentCount AI 채팅: 첨부파일 개수
 * @param hasWebSearch AI 채팅: 웹 검색 사용 여부
 * @param hasImageGen AI 채팅: 이미지 생성 사용 여부
 * @param modelName AI 채팅: 모델명
 * @param nodeCount 그래프 작업: 처리 대상 노드 수
 */
export interface CreditContext {
  /** AI 채팅: 사용자 메시지 길이 (문자 수) */
  messageLength?: number;
  /** AI 채팅: 첨부파일 개수 */
  attachmentCount?: number;
  /** AI 채팅: 웹 검색 사용 여부 */
  hasWebSearch?: boolean;
  /** AI 채팅: 이미지 생성 사용 여부 */
  hasImageGen?: boolean;
  /** AI 채팅: 모델명 */
  modelName?: string;
  /** 그래프 작업: 처리 대상 노드 수 */
  nodeCount?: number;
}

/**
 * 크레딧 비용 계산 전략 인터페이스
 * 새 계산 방식(토큰 기반, 길이 기반 등)은 이 인터페이스를 구현하면 됩니다.
 *
 */
export interface CreditCostCalculator {
  /**
   * 크레딧 비용을 계산합니다.
   * @param context 기능별 컨텍스트 (가변 요금제 전환 전에는 무시됨)
   * @returns 차감할 크레딧 수 (양의 정수)
   */
  calculate(context?: CreditContext): number;
}

/** 고정 크레딧 계산기 — 현재 모든 기능에 사용 */
export class FixedCostCalculator implements CreditCostCalculator {
  constructor(private readonly credits: number) {}

  calculate(_context?: CreditContext): number {
    return this.credits;
  }
}

/**
 * 토큰 기반 계산기 스텁 — 향후 AI 채팅 가변 요금제 전환 시 사용
 * 지금은 사용하지 않으나 인터페이스 준수를 위해 정의해둡니다.
 */
export class TokenBasedCostCalculator implements CreditCostCalculator {
  constructor(
    private readonly creditsPerKInputTokens: number,
    private readonly creditsPerKOutputTokens: number
  ) {}

  calculate(context?: CreditContext): number {
    const inputTokens = Math.ceil((context?.messageLength ?? 0) / 4); // ~4자 = 1 토큰
    return Math.max(1, Math.ceil((inputTokens / 1000) * this.creditsPerKInputTokens));
  }
}

/**
 * 각 기능 별 토큰 비용 임시 하드코딩
 */
const AI_CHAT_COST = 1;
const GRAPH_GENERATION_COST = 10;
const ADD_NODE_COST = 5;
const MICROSCOPE_INGEST_COST = 3;

/**
 * 기능별 크레딧 비용 맵 (중앙 조정 포인트)
 *
 * BM 변경 시 이 맵의 Calculator만 교체하면 됩니다.
 * CreditService, 핸들러, 서비스 코드는 변경 불필요.
 *
 */
export const FEATURE_COSTS: Record<CreditFeature, CreditCostCalculator> = {
  [CreditFeature.AI_CHAT]: new FixedCostCalculator(AI_CHAT_COST),
  [CreditFeature.GRAPH_GENERATION]: new FixedCostCalculator(GRAPH_GENERATION_COST),
  [CreditFeature.ADD_NODE]: new FixedCostCalculator(ADD_NODE_COST),
  [CreditFeature.MICROSCOPE_INGEST]: new FixedCostCalculator(MICROSCOPE_INGEST_COST),
} satisfies Record<CreditFeature, CreditCostCalculator>;

/**
 * 플랜별 월간 크레딧 한도 (refill 시 이 값으로 리셋)
 */
export const PLAN_CREDIT_LIMITS: Record<PlanType, number> = {
  [PlanType.FREE]: 30,
  [PlanType.PRO]: 500,
  [PlanType.ENTERPRISE]: 9999,
} satisfies Record<PlanType, number>;

/** HOLD 트랜잭션 만료 시간 (ms) — 이 시간 이후 만료된 hold는 자동 rollback */
export const HOLD_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2시간

/** 청구 주기 (일) */
export const BILLING_CYCLE_DAYS = 30;
