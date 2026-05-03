/**
 * Graph Editor API에 사용되는 타입 정의
 * 작성일: 2026-05-01
 */

import type { GraphNodeDto, GraphEdgeDto, GraphClusterDto, GraphSubclusterDto } from './graph.js';
import type { GraphSourceType } from './sourceTypes.js';

// ── 노드 ──────────────────────────────────────────────────────

/** 에디터 노드 생성 요청 */
export interface CreateNodeEditorDto {
  label: string;
  summary?: string;
  clusterId: string;
  metadata?: Record<string, unknown>;
  sourceType?: GraphSourceType;
  timestamp?: string | null;
  numMessages?: number;
}

/** 에디터 노드 수정 요청 */
export interface UpdateNodeEditorDto {
  label?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  sourceType?: GraphSourceType;
  timestamp?: string | null;
  numMessages?: number;
}

/** 에디터 노드 생성 응답 */
export interface CreateNodeEditorResponseDto {
  nodeId: number;
  node: GraphNodeDto;
}

// ── 엣지 ──────────────────────────────────────────────────────

/** 에디터 엣지 생성 요청 */
export interface CreateEdgeEditorDto {
  source: number;
  target: number;
  weight?: number;
  relationType?: string;
  relation?: string;
  properties?: Record<string, unknown>;
}

/** 에디터 엣지 수정 요청 */
export interface UpdateEdgeEditorDto {
  weight?: number;
  relationType?: string;
  relation?: string;
  properties?: Record<string, unknown>;
}

/** 에디터 엣지 생성 응답 */
export interface CreateEdgeEditorResponseDto {
  edgeId: string;
  edge: GraphEdgeDto;
}

// ── 클러스터 ───────────────────────────────────────────────────

/** 에디터 클러스터 생성 요청 */
export interface CreateClusterEditorDto {
  id?: string;
  name: string;
  description?: string;
  themes?: string[];
}

/** 에디터 클러스터 수정 요청 */
export interface UpdateClusterEditorDto {
  name?: string;
  description?: string;
  themes?: string[];
}

/** 에디터 클러스터 생성 응답 */
export interface CreateClusterEditorResponseDto {
  cluster: GraphClusterDto;
}

// ── 서브클러스터 ───────────────────────────────────────────────

/** 에디터 서브클러스터 생성 요청 */
export interface CreateSubclusterEditorDto {
  id?: string;
  clusterId: string;
  topKeywords?: string[];
  density?: number;
}

/** 에디터 서브클러스터 수정 요청 */
export interface UpdateSubclusterEditorDto {
  topKeywords?: string[];
  density?: number;
}

/** 에디터 서브클러스터 생성 응답 */
export interface CreateSubclusterEditorResponseDto {
  subcluster: GraphSubclusterDto;
}

// ── 이동/편입 ─────────────────────────────────────────────────

/** 노드 클러스터 이동 요청 */
export interface MoveNodeToClusterDto {
  newClusterId: string;
}

/** 서브클러스터 클러스터 이동 요청 */
export interface MoveSubclusterToClusterDto {
  newClusterId: string;
}

/** 노드 서브클러스터 편입 요청 */
export interface AddNodeToSubclusterDto {
  nodeId: number;
}

// ── 배치 트랜잭션 ─────────────────────────────────────────────

/** 배치 오퍼레이션 단건 결과 */
export interface BatchOperationResult {
  operationIndex: number;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 배치 트랜잭션 응답 */
export interface BatchEditorResponseDto {
  success: boolean;
  results: BatchOperationResult[];
  processedCount: number;
}
