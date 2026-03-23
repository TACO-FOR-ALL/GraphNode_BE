/**
 * 모듈: Graph Summary Mapper
 *
 * 책임:
 * - GraphSummaryDoc(DB 저장 형식, AI 서버 계약 기반) → GraphSummaryDto(FE API 응답 형식) 변환을 담당합니다.
 * - 핵심 역할: AI 서버와 DB가 사용하는 `total_source_nodes`, `generatedAt` 등의 필드를
 *   FE SDK가 기대하는 `total_conversations`, `generated_at` 형식으로 안전하게 변환합니다.
 *
 * 설계 원칙:
 * - FE SDK(`z_npm_sdk/src/types/graph.ts`)의 타입은 절대 변경하지 않는다.
 * - AI 서버 출력(snake_case, total_source_nodes 등) → DB 저장 → FE 응답 변환은 이 Mapper에서 담당한다.
 * - `as any` 사용을 최소화하고 타입 안전성을 최대한 확보한다.
 *
 * 변환 방향:
 * - GraphSummaryDoc → GraphSummaryDto: DB 조회 결과를 FE 응답 포맷으로 변환
 * - GraphSummaryDto (fallback): Summary가 없을 때 기본 빈 DTO 생성
 *
 * 외부 의존:
 * - `graph.persistence.ts`: GraphSummaryDoc
 * - `graph.ts` (dtos): GraphSummaryDto
 */

import type { GraphSummaryDoc } from '../../core/types/persistence/graph.persistence';
import type { GraphSummaryDto } from '../dtos/graph';

/**
 * GraphSummaryDoc(DB 문서)를 GraphSummaryDto(FE API 응답)로 변환합니다.
 *
 * 주요 매핑:
 * - `doc.overview.total_source_nodes` → `dto.overview.total_conversations`
 *   (DB/AI 서버: total_source_nodes, FE SDK: total_conversations)
 * - `doc.generatedAt` (camelCase) → `dto.generated_at` (snake_case)
 *   (DB: camelCase 저장, FE SDK: snake_case 기대)
 *
 * @param doc - MongoDB에서 조회한 GraphSummaryDoc 문서
 * @returns FE SDK와 호환되는 GraphSummaryDto
 * @example
 * const doc = await repo.getGraphSummary(userId);
 * const dto = toGraphSummaryDto(doc);
 * // dto.overview.total_conversations === doc.overview.total_source_nodes
 * // dto.generated_at === doc.generatedAt
 */
export function toGraphSummaryDto(doc: GraphSummaryDoc): GraphSummaryDto {
  return {
    overview: {
      // DB/AI: total_source_nodes → FE: total_conversations (FE SDK 필드명 유지)
      total_conversations: doc.overview.total_source_nodes,
      time_span: doc.overview.time_span,
      primary_interests: doc.overview.primary_interests,
      conversation_style: doc.overview.conversation_style,
      most_active_period: doc.overview.most_active_period,
      summary_text: doc.overview.summary_text,
    },
    clusters: doc.clusters,
    patterns: doc.patterns,
    connections: doc.connections,
    recommendations: doc.recommendations,
    // DB: generatedAt (camelCase) → FE: generated_at (snake_case, FE SDK 필드명 유지)
    generated_at: doc.generatedAt,
    detail_level: doc.detail_level,
  };
}

/**
 * GraphSummaryDoc가 없을 때(Summary 미생성 상태) 반환할 기본 빈 GraphSummaryDto를 생성합니다.
 *
 * @returns 빈 GraphSummaryDto (Overview 모두 기본값, clusters/patterns 등 빈 배열)
 * @remarks
 * - `total_conversations: 0`은 FE SDK의 필드명을 따름
 * - `detail_level: 'standard'`를 기본값으로 사용 ('brief'|'standard'|'detailed' 중 하나)
 * @example
 * const dto = createEmptyGraphSummaryDto();
 * // dto.overview.total_conversations === 0
 * // dto.clusters === []
 */
export function createEmptyGraphSummaryDto(): GraphSummaryDto {
  return {
    overview: {
      total_conversations: 0,   // FE SDK 필드명 유지
      time_span: '',
      primary_interests: [],
      conversation_style: '',
      most_active_period: '',
      summary_text: '',
    },
    clusters: [],
    patterns: [],
    connections: [],
    recommendations: [],
    generated_at: new Date().toISOString(),  // FE SDK: snake_case
    detail_level: 'standard',               // GraphSummaryDoc.detail_level Union 기본값
  };
}
