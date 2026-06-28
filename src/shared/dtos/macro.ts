/**
 * 매크로 뷰 관련 DTO 및 도메인 타입 정의
 *
 * MANUAL 모드: 사용자가 dataTypes·createdPeriod 필터를 지정 → BE가 DB에서 ID 목록을 수집해 S3에 업로드 → AI가 처리.
 * AUTO 모드: 사용자가 intent(자연어 의도)를 지정 → BE가 전체 데이터 ID 목록을 S3에 업로드 → AI가 자율 선택.
 */

/** 데이터 필터링 가능한 원천 타입 */
export type ScopeDataType = 'chat' | 'file' | 'notion' | 'note';

/** 데이터 생성 기간 필터 */
export type ScopeCreatedPeriod = '1w' | '1m' | '3m' | '1y';

/**
 * @description 매크로 뷰 데이터 스코프 필터 조건입니다.
 *
 * `mode: 'auto'`인 경우 `intent`를 채우고 `filters`는 생략합니다.
 * `mode: 'manual'`인 경우 `filters.dataTypes`를 반드시 채웁니다.
 *
 * @example AUTO: `{ mode: 'auto', intent: 'RAG 아키텍처 연구' }`
 * @example MANUAL: `{ mode: 'manual', filters: { dataTypes: ['chat', 'file'], createdPeriod: '3m' } }`
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

/**
 * @description 매크로 뷰 목록 조회 정렬 기준입니다.
 */
export type MacroViewSortKey = 'updatedAt' | 'createdAt' | 'nodeCount' | 'title';

/**
 * @description 매크로 뷰 메타데이터 DTO (목록 및 상세 응답용)입니다.
 *
 * @property macroId 매크로 뷰 고유 ID
 * @property userId 소유 사용자 ID
 * @property title 사용자가 지정한 제목
 * @property description 사용자가 지정한 설명
 * @property scopeFilter 파싱된 데이터 필터 조건
 * @property status 그래프 생성 상태
 * @property nodeCount 포함된 노드 수 (집계)
 * @property createdAt 생성 시각 (ISO 8601)
 * @property updatedAt 마지막 수정 시각 (ISO 8601)
 * @property deletedAt soft delete 시각 (ISO 8601). 없으면 활성 상태
 */
export interface MacroViewDto {
  /** 매크로 뷰 고유 ID */
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
  /** 포함된 노드 수 (집계) */
  nodeCount?: number;
  /** 생성 시각 (ISO 8601) */
  createdAt?: string;
  /** 마지막 수정 시각 (ISO 8601) */
  updatedAt?: string;
  /** soft delete 시각 (ISO 8601). 없으면 활성 상태 */
  deletedAt?: string;
}

/**
 * @description POST /v1/macro-views 요청 바디입니다.
 *
 * @property title 매크로 뷰 제목 (1–200자, optional — AI가 자동 생성 가능)
 * @property description 매크로 뷰 설명 (optional)
 * @property scopeFilter 데이터 스코프 필터 조건 (필수)
 */
export interface CreateMacroViewDto {
  /** 매크로 뷰 제목 (1–200자) */
  title?: string;
  /** 매크로 뷰 설명 */
  description?: string;
  /** 데이터 스코프 필터 조건 */
  scopeFilter: ScopeFilter;
}

/**
 * @description PATCH /v1/macro-views/:macroId 요청 바디입니다.
 *
 * @property title 새 제목 (1–200자)
 * @property description 새 설명
 * @property scopeFilter 새 스코프 필터 조건
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
 * @description GET /v1/macro-views 쿼리 파라미터입니다.
 *
 * @property sortBy 정렬 기준
 * @property includeDeleted 휴지통 항목 포함 여부
 * @property onlyDeleted 휴지통 항목만 조회
 */
export interface ListMacroViewsQuery {
  /** 정렬 기준 (기본값: updatedAt) */
  sortBy?: MacroViewSortKey;
  /** 휴지통 항목만 조회 */
  onlyDeleted?: boolean;
}
