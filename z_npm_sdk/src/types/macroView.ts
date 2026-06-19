/**
 * 매크로 뷰 관련 SDK 타입 정의.
 *
 * BE의 `src/shared/dtos/macro.ts`와 동기화되어야 합니다.
 * @public
 */

/** 필터링 가능한 원천 데이터 타입 */
export type ScopeDataType = 'chat' | 'file' | 'notion' | 'note';

/** 데이터 생성 기간 필터 */
export type ScopeCreatedPeriod = '1w' | '1m' | '3m' | '1y';

/**
 * 매크로 뷰 데이터 스코프 필터 조건.
 *
 * - `mode: 'auto'` → `intent` 필수, `filters` 생략
 * - `mode: 'manual'` → `filters.dataTypes` 필수 (1개 이상)
 *
 * @example AUTO:   `{ mode: 'auto', intent: 'RAG 아키텍처 연구' }`
 * @example MANUAL: `{ mode: 'manual', filters: { dataTypes: ['chat', 'file'], createdPeriod: '3m' } }`
 * @public
 */
export interface ScopeFilter {
  /** 데이터 선택 모드 */
  mode: 'auto' | 'manual';
  /**
   * MANUAL 모드 전용 필터 조건.
   * mode가 'manual'인 경우 반드시 포함되어야 합니다.
   */
  filters?: {
    /** 포함할 데이터 타입 목록 (최소 1개) */
    dataTypes: ScopeDataType[];
    /** 데이터 생성 기간 필터. 없으면 전체 기간 */
    createdPeriod?: ScopeCreatedPeriod;
  };
  /**
   * AUTO 모드 전용 — AI에 전달할 자연어 의도.
   * mode가 'auto'인 경우 반드시 포함되어야 합니다.
   */
  intent?: string;
}

/** 매크로 뷰 목록 정렬 기준 */
export type MacroViewSortKey = 'updatedAt' | 'createdAt' | 'nodeCount' | 'title';

/**
 * 매크로 뷰 메타데이터 DTO (목록 및 상세 응답용).
 * @public
 */
export interface MacroViewDto {
  /** 매크로 뷰 고유 ID (ULID) */
  macroId: string;
  /** 소유 사용자 ID */
  userId: string;
  /** 사용자가 지정한 제목 */
  title?: string;
  /** 사용자가 지정한 설명 */
  description?: string;
  /** 파싱된 데이터 필터 조건 */
  scopeFilter?: ScopeFilter;
  /** 그래프 생성 상태 */
  status?: string;
  /** 포함된 노드 수 */
  nodeCount?: number;
  /** 생성 시각 (ISO 8601) */
  createdAt?: string;
  /** 마지막 수정 시각 (ISO 8601) */
  updatedAt?: string;
  /** soft delete 시각 (ISO 8601). null/undefined이면 활성 상태 */
  deletedAt?: string;
}

/**
 * POST /v1/macro-views 요청 바디.
 * @public
 */
export interface CreateMacroViewDto {
  /** 매크로 뷰 제목 (1–200자, optional — AI 자동 생성 가능) */
  title?: string;
  /** 매크로 뷰 설명 */
  description?: string;
  /** 데이터 스코프 필터 조건 (필수) */
  scopeFilter: ScopeFilter;
}

/**
 * PATCH /v1/macro-views/:macroId 요청 바디.
 * @public
 */
export interface UpdateMacroViewDto {
  /** 새 제목 (1–200자) */
  title?: string;
  /** 새 설명 */
  description?: string;
  /** 새 스코프 필터 조건 */
  scopeFilter?: ScopeFilter;
}

/**
 * GET /v1/macro-views 쿼리 파라미터.
 * @public
 */
export interface ListMacroViewsQuery {
  /** 정렬 기준 (기본값: updatedAt) */
  sortBy?: MacroViewSortKey;
  /** 휴지통 항목(soft-deleted)만 조회 */
  onlyDeleted?: boolean;
}

/** GET /v1/macro-views 응답 */
export interface ListMacroViewsResponse {
  views: MacroViewDto[];
}

/** GET /v1/macro-views/:macroId 응답 */
export interface GetMacroViewResponse {
  view: MacroViewDto;
}

/** POST /v1/macro-views 응답 */
export interface CreateMacroViewResponse {
  view: MacroViewDto;
}

/** PATCH /v1/macro-views/:macroId 응답 */
export interface UpdateMacroViewResponse {
  view: MacroViewDto;
}

/** POST /v1/macro-views/:macroId/clone 응답 */
export interface CloneMacroViewResponse {
  view: MacroViewDto;
}

/** POST /v1/macro-views/:macroId/restore 응답 */
export interface RestoreMacroViewResponse {
  message: string;
}
