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
 * - `nodeTitle`은 노드의 실제 제목이며, `label`(사용자 지정 분류 tag)과 별개입니다.
 */
export interface CreateNodeEditorDto {
  /** 노드 표시 이름 (1-200자). AI 생성 노드와 구별하기 위한 분류 label로, 실제 제목은 nodeTitle을 사용합니다. */
  label: string;
  /** 노드 요약 설명 (최대 2000자). 노드 내용을 한 단락으로 요약한 텍스트입니다. */
  summary?: string;
  /** 소속 클러스터 ID (필수). 노드는 반드시 하나의 cluster에 속해야 합니다. */
  clusterId: string;
  /** 임의 속성 맵 (예약 필드 `id`, `userId`, `createdAt` 제외). 서버에서 예약 키를 자동 제거합니다. */
  metadata?: Record<string, unknown>;
  /** 노드 출처 유형. `'chat'` | `'markdown'` | `'notion'` | `'file'` 중 하나입니다. */
  sourceType?: GraphSourceType;
  /** 대화 발생 시각 (ISO 8601 UTC 문자열 또는 null). 소스가 chat인 경우 메시지 전송 시각입니다. */
  timestamp?: string | null;
  /** 노드에 포함된 메시지 턴 수. chat 소스의 대화 길이를 나타냅니다. */
  numMessages?: number;
  /** 노드의 실제 제목 (최대 500자). label과 별개이며, 사용자가 지정하는 노드 이름입니다. */
  nodeTitle?: string;
}

/**
 * 편집기를 통한 노드 수정 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 모든 필드가 선택 사항입니다. 제공된 필드만 부분 업데이트(PATCH)됩니다.
 * - `clusterId` 변경은 이 DTO로 하지 않고 `move-cluster` 엔드포인트를 사용합니다.
 * - `nodeTitle`은 노드의 실제 제목이며, `label`(사용자 지정 분류 tag)과 별개입니다.
 */
export interface UpdateNodeEditorDto {
  /** 노드 표시 이름 (1-200자). AI 생성 노드와 구별하기 위한 분류 label입니다. */
  label?: string;
  /** 노드 요약 설명 (최대 2000자). 제공 시 기존 summary를 덮어씁니다. */
  summary?: string;
  /** 임의 속성 맵 (예약 필드 `id`, `userId`, `createdAt` 제외). 제공 시 기존 metadata를 덮어씁니다. */
  metadata?: Record<string, unknown>;
  /** 노드 출처 유형. `'chat'` | `'markdown'` | `'notion'` | `'file'` 중 하나입니다. */
  sourceType?: GraphSourceType;
  /** 대화 발생 시각 (ISO 8601 UTC 문자열 또는 null). null 제공 시 기존 timestamp를 제거합니다. */
  timestamp?: string | null;
  /** 노드에 포함된 메시지 턴 수. chat 소스의 대화 길이를 나타냅니다. */
  numMessages?: number;
  /** 노드의 실제 제목 (최대 500자). 제공 시 기존 nodeTitle을 덮어씁니다. */
  nodeTitle?: string;
}

/**
 * 편집기를 통한 노드 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateNodeEditorResponseDto {
  /** 서버가 발급한 숫자형 노드 ID (`max(id) + 1` 방식으로 자동 생성됩니다). */
  nodeId: number;
  /** 생성된 노드의 전체 DTO. 서버가 설정한 모든 필드를 포함합니다. */
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
 * - `weight` 필드는 FE 호환성을 위해 수신하지만, 서버에서 항상 `1.0`으로 고정합니다 (PM 임시 정책).
 */
export interface CreateEdgeEditorDto {
  /** 출발 노드 ID (필수). 동일 사용자의 활성 노드여야 합니다. */
  source: number;
  /** 도착 노드 ID (필수). source와 달라야 하며 동일 사용자의 활성 노드여야 합니다. */
  target: number;
  /**
   * 엣지 가중치 (0~1). FE 호환성을 위해 수신은 하지만, 서버에서 항상 `1.0`으로 고정됩니다.
   * 임시 PM 정책으로, 이후 동적 가중치를 허용할 때 이 필드를 활성화합니다.
   */
  weight?: number;
  /**
   * 사용자 정의 관계 타입.
   * 영문자·숫자·공백·하이픈으로 입력하면 서버에서 UPPER_SNAKE_CASE로 자동 정규화됩니다.
   * 예: `"depends on"` → `"DEPENDS_ON"`. 미제공 시 `'INSIGHT'`로 저장됩니다.
   * 시스템 예약어(BELONGS_TO, HAS_SUBCLUSTER 등)는 사용할 수 없습니다.
   */
  relationType?: string;
  /** 사용자 정의 관계 이름 (UI 표시용 레이블). `relationType`과 달리 정규화 없이 그대로 저장됩니다. */
  relation?: string;
  /** 임의 속성 맵 (예약 필드 `id`, `userId`, `createdAt` 제외). Graph RAG 탐색에 활용됩니다. */
  properties?: Record<string, unknown>;
}

/**
 * 편집기를 통한 엣지 수정 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 모든 필드가 선택 사항입니다. 제공된 필드만 부분 업데이트(PATCH)됩니다.
 * - `relationType` 수정 시 서버에서 UPPER_SNAKE_CASE로 정규화됩니다.
 * - updateEdge에서 weight 수정은 허용됩니다 (createEdge와 다르게 고정되지 않음).
 */
export interface UpdateEdgeEditorDto {
  /** 엣지 가중치 (0~1). updateEdge에서는 자유롭게 수정 가능합니다. */
  weight?: number;
  /** 사용자 정의 관계 타입. 제공 시 서버에서 UPPER_SNAKE_CASE로 자동 정규화됩니다. */
  relationType?: string;
  /** 사용자 정의 관계 이름 (UI 표시용 레이블). 정규화 없이 그대로 저장됩니다. */
  relation?: string;
  /** 임의 속성 맵 (예약 필드 `id`, `userId`, `createdAt` 제외). 제공 시 기존 properties를 덮어씁니다. */
  properties?: Record<string, unknown>;
}

/**
 * 편집기를 통한 엣지 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateEdgeEditorResponseDto {
  /** 서버가 발급한 UUID 형식의 엣지 ID. */
  edgeId: string;
  /** 생성된 엣지의 전체 DTO. 서버가 설정한 모든 필드를 포함합니다. */
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
 * - 동일 `id`의 클러스터가 이미 존재하면 `409 Conflict`를 반환합니다.
 */
export interface CreateClusterEditorDto {
  /** 클러스터 ID (선택, 최대 100자). 미제공 시 서버가 UUID v4를 자동 생성합니다. */
  id?: string;
  /** 클러스터 이름 (필수, 1-200자). 클러스터를 대표하는 주제 이름입니다. */
  name: string;
  /** 클러스터 설명 (최대 2000자). 클러스터의 목적이나 범위를 서술합니다. */
  description?: string;
  /** 핵심 주제 목록 (최대 10개). 클러스터를 특징짓는 키워드입니다. */
  themes?: string[];
}

/**
 * 편집기를 통한 클러스터 수정 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 모든 필드가 선택 사항입니다. 제공된 필드만 부분 업데이트(PATCH)됩니다.
 * - 클러스터 ID는 변경할 수 없습니다.
 */
export interface UpdateClusterEditorDto {
  /** 클러스터 이름 (1-200자). 제공 시 기존 이름을 덮어씁니다. */
  name?: string;
  /** 클러스터 설명 (최대 2000자). 제공 시 기존 설명을 덮어씁니다. */
  description?: string;
  /** 핵심 주제 목록 (최대 10개). 제공 시 기존 themes 배열 전체를 교체합니다. */
  themes?: string[];
}

/**
 * 편집기를 통한 클러스터 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateClusterEditorResponseDto {
  /** 생성된 클러스터의 전체 DTO. 서버가 설정한 모든 필드를 포함합니다. */
  cluster: GraphClusterDto;
}

/**
 * 클러스터 삭제 옵션.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - `cascade=true`이면 클러스터 내 모든 노드와 해당 노드들의 엣지까지 삭제합니다.
 * - `cascade=false`(기본값)이면 활성 노드가 있을 경우 `409 Conflict`를 반환합니다.
 */
export interface DeleteClusterEditorOptions {
  /** `true`이면 하위 노드·엣지 포함 cascade 삭제. `false`(기본값)이면 활성 노드 존재 시 거부합니다. */
  cascade?: boolean;
  /** `true`이면 물리적 삭제(복원 불가), `false`(기본값)이면 논리적 삭제(soft delete)입니다. */
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
 * - 동일 `id`의 서브클러스터가 이미 존재하면 `409 Conflict`를 반환합니다.
 */
export interface CreateSubclusterEditorDto {
  /** 서브클러스터 ID (선택, 최대 100자). 미제공 시 서버가 UUID v4를 자동 생성합니다. */
  id?: string;
  /** 소속 클러스터 ID (필수). 서브클러스터는 반드시 하나의 cluster에 속해야 합니다. */
  clusterId: string;
  /** 서브클러스터를 대표하는 주요 키워드 목록 (최대 20개). AI 분석 결과를 저장하는 데 사용됩니다. */
  topKeywords?: string[];
  /** 서브클러스터 내 노드 간 연결 밀도 (0~1). 값이 높을수록 노드 간 관계가 촘촘합니다. */
  density?: number;
}

/**
 * 편집기를 통한 서브클러스터 수정 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 모든 필드가 선택 사항입니다. 제공된 필드만 부분 업데이트(PATCH)됩니다.
 */
export interface UpdateSubclusterEditorDto {
  /** 주요 키워드 목록 (최대 20개). 제공 시 기존 topKeywords 배열 전체를 교체합니다. */
  topKeywords?: string[];
  /** 연결 밀도 (0~1). 제공 시 기존 density 값을 덮어씁니다. */
  density?: number;
}

/**
 * 편집기를 통한 서브클러스터 생성 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface CreateSubclusterEditorResponseDto {
  /** 생성된 서브클러스터의 전체 DTO. 서버가 설정한 모든 필드를 포함합니다. */
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
  /** 이동 대상 클러스터 ID (필수). 동일 사용자의 활성 클러스터여야 합니다. */
  newClusterId: string;
}

/**
 * 서브클러스터를 다른 클러스터로 이동하는 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 서브클러스터 이동 시, 소속 노드들도 새 클러스터로 자동 이동합니다(Follower Move).
 * - 클라이언트가 노드를 별도로 이동할 필요가 없습니다.
 */
export interface MoveSubclusterToClusterDto {
  /** 이동 대상 클러스터 ID (필수). 서브클러스터와 소속 노드 전체가 이 클러스터로 이동합니다. */
  newClusterId: string;
}

/**
 * 서브클러스터에 노드를 편입하는 요청 DTO.
 * 작성일: 2026-05-01
 *
 * @remarks
 * - 노드의 clusterId와 서브클러스터의 clusterId가 반드시 일치해야 합니다.
 * - 불일치 시 `400 Bad Request`를 반환합니다.
 * - 이미 편입된 노드를 다시 요청해도 중복 없이 성공합니다(MERGE 방식).
 */
export interface AddNodeToSubclusterDto {
  /** 편입할 노드 ID (필수). 서브클러스터와 동일한 clusterId를 가진 노드여야 합니다. */
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
 * - 각 operation은 `type` 필드로 구분되는 discriminated union입니다.
 * - 최대 100개 operation을 단일 요청에 포함할 수 있습니다.
 * - 중간 operation 실패 시 이미 완료된 이전 작업은 롤백되지 않습니다(best-effort sequential).
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
 * - 첫 번째 실패 operation에서 실행이 중단됩니다(이미 완료된 작업은 롤백되지 않음).
 */
export interface BatchEditorRequestDto {
  /** 소속 매크로 뷰 ID. createNode 등 macroId가 필요한 operation에 사용됩니다. */
  macroId: string;
  /** 순서대로 실행할 편집 작업 목록 (최소 1개, 최대 100개). */
  operations: EditorBatchOperation[];
}

/**
 * 배치 편집 트랜잭션의 단일 작업 결과.
 * 작성일: 2026-05-01
 */
export interface BatchOperationResult {
  /** 배열 내 해당 작업의 0-based 인덱스. */
  operationIndex: number;
  /** 해당 operation의 성공 여부. */
  success: boolean;
  /** 실패 시 오류 메시지. `success: false`일 때만 존재합니다. */
  error?: string;
  /** 성공 시 반환 데이터. create 계열 operation에서만 반환됩니다. */
  data?: unknown;
}

/**
 * 배치 편집 트랜잭션 응답 DTO.
 * 작성일: 2026-05-01
 */
export interface BatchEditorResponseDto {
  /** 모든 operation이 성공했는지 여부. 부분 실패 시 `false`입니다. */
  success: boolean;
  /** 각 operation별 결과 목록. 실행된 순서대로 반환됩니다. */
  results: BatchOperationResult[];
  /** 성공적으로 처리된 operation 수. 실패 직전까지의 처리 수입니다. */
  processedCount: number;
}
