/**
 * 모듈: Graph Editor 요청/응답 DTO
 * 작성일: 2026-05-01
 *
 * 책임:
 * - 사용자가 직접 macro graph를 편집할 수 있도록 REST API에서 사용하는 DTO를 정의합니다.
 * - 기존 GraphNodeDto/GraphEdgeDto/GraphClusterDto 등을 침범하지 않고 별도로 관리합니다.
 * - 하위 호환성: 기존 DTO 수정 없이 editor 전용 DTO를 추가합니다.
 *
 * 외부 의존: graph.ts의 GraphNodeDto, GraphEdgeDto, GraphClusterDto, GraphSubclusterDto
 */

import type {
  GraphNodeDto,
  GraphEdgeDto,
  GraphClusterDto,
  GraphSubclusterDto,
  GraphSourceType,
} from './graph';

// =====================
// Node Editor DTOs
// =====================

/**
 * 편집기를 통한 노드 생성 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `clusterId`는 필수입니다. 노드는 반드시 하나의 cluster에 속해야 합니다.
 * - `id`는 서버에서 자동 발급합니다. 클라이언트에서 제공하면 무시됩니다.
 * - `metadata`에서 예약 필드(`id`, `userId`, `createdAt`)는 덮어쓸 수 없습니다.
 */
export interface CreateNodeEditorDto {
  /** 노드 표시 이름 (1-200자) */
  label: string;
  /** 노드 요약 설명 */
  summary?: string;
  /** 소속 클러스터 ID (필수) */
  clusterId: string;
  /** 임의 속성 (예약 필드 제외) */
  metadata?: Record<string, unknown>;
  /** 노드 출처 유형 */
  sourceType?: GraphSourceType;
  /** 대화 발생 시각 (ISO 8601) */
  timestamp?: string | null;
  /** 메시지 턴 수 */
  numMessages?: number;
}

/**
 * 편집기를 통한 노드 수정 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 모든 필드가 선택 사항입니다. 제공된 필드만 업데이트됩니다.
 * - `clusterId` 변경은 이 DTO로 하지 않고 `move-cluster` 엔드포인트를 사용합니다.
 */
export interface UpdateNodeEditorDto {
  /** 노드 표시 이름 */
  label?: string;
  /** 노드 요약 설명 */
  summary?: string;
  /** 임의 속성 (예약 필드 제외) */
  metadata?: Record<string, unknown>;
  /** 노드 출처 유형 */
  sourceType?: GraphSourceType;
  /** 대화 발생 시각 (ISO 8601) */
  timestamp?: string | null;
  /** 메시지 턴 수 */
  numMessages?: number;
}

/**
 * 편집기를 통한 노드 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateNodeEditorResponseDto {
  /** 생성된 노드 ID */
  nodeId: number;
  /** 생성된 노드 전체 DTO */
  node: GraphNodeDto;
}

// =====================
// Edge Editor DTOs
// =====================

/**
 * 편집기를 통한 엣지 생성 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `source`, `target`은 동일 사용자의 활성 노드여야 합니다.
 * - `relationType`은 사용자 정의 관계 타입으로, UPPER_SNAKE_CASE로 정규화됩니다.
 *   예약어(BELONGS_TO, HAS_SUBCLUSTER 등)는 사용 불가합니다.
 * - `properties`의 예약 필드(`id`, `userId`, `createdAt`)는 덮어쓸 수 없습니다.
 */
export interface CreateEdgeEditorDto {
  /** 출발 노드 ID (필수) */
  source: number;
  /** 도착 노드 ID (필수) */
  target: number;
  /** 엣지 가중치 (0~1, 기본값 0.5) */
  weight?: number;
  /**
   * 사용자 정의 관계 타입.
   * 영문자·숫자·공백으로 입력하면 UPPER_SNAKE_CASE로 자동 정규화됩니다.
   * 미제공 시 'INSIGHT'로 저장됩니다.
   */
  relationType?: string;
  /** 사용자 정의 관계 이름 (표시용) */
  relation?: string;
  /** 임의 속성 (예약 필드 제외) */
  properties?: Record<string, unknown>;
}

/**
 * 편집기를 통한 엣지 수정 요청 DTO.
 * 작성일: 2026-05-01
 */
export interface UpdateEdgeEditorDto {
  /** 엣지 가중치 (0~1) */
  weight?: number;
  /** 사용자 정의 관계 타입 (UPPER_SNAKE_CASE로 정규화됨) */
  relationType?: string;
  /** 사용자 정의 관계 이름 (표시용) */
  relation?: string;
  /** 임의 속성 (예약 필드 제외) */
  properties?: Record<string, unknown>;
}

/**
 * 편집기를 통한 엣지 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateEdgeEditorResponseDto {
  /** 생성된 엣지 ID */
  edgeId: string;
  /** 생성된 엣지 전체 DTO */
  edge: GraphEdgeDto;
}

// =====================
// Cluster Editor DTOs
// =====================

/**
 * 편집기를 통한 클러스터 생성 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `id`를 제공하지 않으면 서버가 UUID v4로 자동 생성합니다.
 */
export interface CreateClusterEditorDto {
  /** 클러스터 ID (선택, 미제공 시 자동 생성) */
  id?: string;
  /** 클러스터 이름 (필수, 1-200자) */
  name: string;
  /** 클러스터 설명 */
  description?: string;
  /** 핵심 주제 (최대 10개) */
  themes?: string[];
}

/**
 * 편집기를 통한 클러스터 수정 요청 DTO.
 * 작성일: 2026-05-01
 */
export interface UpdateClusterEditorDto {
  /** 클러스터 이름 */
  name?: string;
  /** 클러스터 설명 */
  description?: string;
  /** 핵심 주제 */
  themes?: string[];
}

/**
 * 편집기를 통한 클러스터 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateClusterEditorResponseDto {
  /** 생성된 클러스터 전체 DTO */
  cluster: GraphClusterDto;
}

/**
 * 클러스터 삭제 옵션.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `cascade=true`이면 클러스터 내 모든 노드와 해당 노드들의 엣지까지 삭제합니다.
 * - `cascade=false`(기본값)이면 노드가 있을 경우 삭제를 거부합니다.
 */
export interface DeleteClusterEditorOptions {
  /** true이면 하위 노드·엣지 포함 cascade 삭제 */
  cascade?: boolean;
  /** true이면 물리적 삭제, false이면 논리적 삭제 */
  permanent?: boolean;
}

// =====================
// Subcluster Editor DTOs
// =====================

/**
 * 편집기를 통한 서브클러스터 생성 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `clusterId`는 필수입니다. 서브클러스터는 반드시 하나의 cluster에 속해야 합니다.
 */
export interface CreateSubclusterEditorDto {
  /** 서브클러스터 ID (선택, 미제공 시 자동 생성) */
  id?: string;
  /** 소속 클러스터 ID (필수) */
  clusterId: string;
  /** 주요 키워드 */
  topKeywords?: string[];
  /** 밀도 (0~1) */
  density?: number;
}

/**
 * 편집기를 통한 서브클러스터 수정 요청 DTO.
 * 작성일: 2026-05-01
 */
export interface UpdateSubclusterEditorDto {
  /** 주요 키워드 */
  topKeywords?: string[];
  /** 밀도 (0~1) */
  density?: number;
}

/**
 * 편집기를 통한 서브클러스터 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateSubclusterEditorResponseDto {
  /** 생성된 서브클러스터 전체 DTO */
  subcluster: GraphSubclusterDto;
}

// =====================
// Move / Membership DTOs
// =====================

/**
 * 노드를 다른 클러스터로 이동하는 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 이동 대상 클러스터는 동일 사용자의 활성 클러스터여야 합니다.
 * - 노드가 서브클러스터에 속해 있을 경우, 서브클러스터의 clusterId와 불일치가 발생하면
 *   해당 서브클러스터에서 노드를 자동으로 제거합니다.
 */
export interface MoveNodeToClusterDto {
  /** 이동 대상 클러스터 ID (필수) */
  newClusterId: string;
}

/**
 * 서브클러스터를 다른 클러스터로 이동하는 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 이동 시 서브클러스터에 속한 노드들은 기존 클러스터를 유지합니다.
 *   일관성 보장을 위해 서브클러스터 내 모든 노드도 새 클러스터로 이동합니다.
 */
export interface MoveSubclusterToClusterDto {
  /** 이동 대상 클러스터 ID (필수) */
  newClusterId: string;
}

/**
 * 서브클러스터에 노드를 편입하는 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 노드의 clusterId와 서브클러스터의 clusterId가 일치해야 합니다.
 *   불일치 시 에러를 반환합니다.
 */
export interface AddNodeToSubclusterDto {
  /** 편입할 노드 ID (필수) */
  nodeId: number;
}

// =====================
// Batch Transaction DTOs
// =====================

/**
 * 배치 편집 작업 단위 타입.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 각 operation은 `type` 필드로 구분됩니다.
 * - 모든 operation이 단일 Neo4j write transaction 내에서 순서대로 실행됩니다.
 * - 중간에 오류가 발생하면 전체 transaction이 롤백됩니다.
 */
export type EditorBatchOperation =
  | { type: 'createNode'; payload: CreateNodeEditorDto }
  | { type: 'updateNode'; nodeId: number; payload: UpdateNodeEditorDto }
  | { type: 'deleteNode'; nodeId: number; permanent?: boolean }
  | { type: 'createEdge'; payload: CreateEdgeEditorDto }
  | { type: 'updateEdge'; edgeId: string; payload: UpdateEdgeEditorDto }
  | { type: 'deleteEdge'; edgeId: string; permanent?: boolean }
  | { type: 'createCluster'; payload: CreateClusterEditorDto }
  | { type: 'updateCluster'; clusterId: string; payload: UpdateClusterEditorDto }
  | { type: 'deleteCluster'; clusterId: string; cascade?: boolean; permanent?: boolean }
  | { type: 'createSubcluster'; payload: CreateSubclusterEditorDto }
  | { type: 'updateSubcluster'; subclusterId: string; payload: UpdateSubclusterEditorDto }
  | { type: 'deleteSubcluster'; subclusterId: string; permanent?: boolean }
  | { type: 'moveNodeToCluster'; nodeId: number; newClusterId: string }
  | { type: 'moveSubclusterToCluster'; subclusterId: string; newClusterId: string }
  | { type: 'addNodeToSubcluster'; subclusterId: string; nodeId: number }
  | { type: 'removeNodeFromSubcluster'; subclusterId: string; nodeId: number };

/**
 * 배치 편집 트랜잭션 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `operations` 배열의 순서대로 실행됩니다.
 * - 최대 100개 operation을 허용합니다.
 */
export interface BatchEditorRequestDto {
  /** 순서대로 실행할 편집 작업 목록 (최대 100개) */
  operations: EditorBatchOperation[];
}

/**
 * 배치 편집 트랜잭션의 단일 작업 결과.
 * 작성일: 2026-05-01
 */
export interface BatchOperationResult {
  /** 해당 작업의 인덱스 (0-based) */
  operationIndex: number;
  /** 성공 여부 */
  success: boolean;
  /** 실패 시 오류 메시지 */
  error?: string;
  /** 성공 시 반환 데이터 (createNode, createEdge, createCluster, createSubcluster) */
  data?: unknown;
}

/**
 * 배치 편집 트랜잭션 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface BatchEditorResponseDto {
  /** 전체 성공 여부 */
  success: boolean;
  /** 작업별 결과 목록 */
  results: BatchOperationResult[];
  /** 처리된 작업 수 */
  processedCount: number;
}
