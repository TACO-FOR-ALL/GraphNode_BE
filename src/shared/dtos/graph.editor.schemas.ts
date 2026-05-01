/**
 * 모듈: Graph Editor Zod 검증 스키마
 * 작성일: 2026-05-01
 *
 * 책임:
 * - graph.editor.ts DTO에 대응하는 Zod 스키마를 정의합니다.
 * - Controller 계층에서 요청 본문 검증에 사용됩니다.
 */

import { z } from 'zod';

import { GRAPH_SOURCE_TYPES } from './graph.source-types';

/** 예약 필드 목록 — metadata/properties에서 덮어쓰기를 차단합니다. 작성일: 2026-05-01 */
const RESERVED_METADATA_KEYS = ['id', 'userId', 'createdAt'] as const;

/**
 * 임의 속성 맵 스키마. 예약 필드 포함 시 에러를 발생시킵니다. 작성일: 2026-05-01
 */
const arbitraryPropsSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (obj) => RESERVED_METADATA_KEYS.every((k) => !(k in obj)),
    { message: `metadata/properties must not contain reserved keys: ${RESERVED_METADATA_KEYS.join(', ')}` }
  )
  .optional();

// =====================
// Node Schemas
// =====================

/**
 * 노드 생성 요청 스키마. 작성일: 2026-05-01
 */
export const createNodeEditorSchema = z.object({
  label: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  clusterId: z.string().min(1),
  metadata: arbitraryPropsSchema,
  sourceType: z.enum(GRAPH_SOURCE_TYPES).optional(),
  timestamp: z.string().nullable().optional(),
  numMessages: z.number().int().min(0).optional(),
});

/**
 * 노드 수정 요청 스키마. 작성일: 2026-05-01
 */
export const updateNodeEditorSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).optional(),
  metadata: arbitraryPropsSchema,
  sourceType: z.enum(GRAPH_SOURCE_TYPES).optional(),
  timestamp: z.string().nullable().optional(),
  numMessages: z.number().int().min(0).optional(),
});

// =====================
// Edge Schemas
// =====================

/**
 * 엣지 생성 요청 스키마. 작성일: 2026-05-01
 */
export const createEdgeEditorSchema = z.object({
  source: z.number().int().positive(),
  target: z.number().int().positive(),
  weight: z.number().min(0).max(1).optional(),
  relationType: z.string().min(1).max(100).optional(),
  relation: z.string().max(200).optional(),
  properties: arbitraryPropsSchema,
});

/**
 * 엣지 수정 요청 스키마. 작성일: 2026-05-01
 */
export const updateEdgeEditorSchema = z.object({
  weight: z.number().min(0).max(1).optional(),
  relationType: z.string().min(1).max(100).optional(),
  relation: z.string().max(200).optional(),
  properties: arbitraryPropsSchema,
});

// =====================
// Cluster Schemas
// =====================

/**
 * 클러스터 생성 요청 스키마. 작성일: 2026-05-01
 */
export const createClusterEditorSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  themes: z.array(z.string().max(100)).max(10).optional(),
});

/**
 * 클러스터 수정 요청 스키마. 작성일: 2026-05-01
 */
export const updateClusterEditorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  themes: z.array(z.string().max(100)).max(10).optional(),
});

// =====================
// Subcluster Schemas
// =====================

/**
 * 서브클러스터 생성 요청 스키마. 작성일: 2026-05-01
 */
export const createSubclusterEditorSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  clusterId: z.string().min(1),
  topKeywords: z.array(z.string().max(100)).max(20).optional(),
  density: z.number().min(0).max(1).optional(),
});

/**
 * 서브클러스터 수정 요청 스키마. 작성일: 2026-05-01
 */
export const updateSubclusterEditorSchema = z.object({
  topKeywords: z.array(z.string().max(100)).max(20).optional(),
  density: z.number().min(0).max(1).optional(),
});

// =====================
// Move / Membership Schemas
// =====================

/**
 * 노드 클러스터 이동 요청 스키마. 작성일: 2026-05-01
 */
export const moveNodeToClusterSchema = z.object({
  newClusterId: z.string().min(1),
});

/**
 * 서브클러스터 클러스터 이동 요청 스키마. 작성일: 2026-05-01
 */
export const moveSubclusterToClusterSchema = z.object({
  newClusterId: z.string().min(1),
});

/**
 * 노드 서브클러스터 편입 요청 스키마. 작성일: 2026-05-01
 */
export const addNodeToSubclusterSchema = z.object({
  nodeId: z.number().int().positive(),
});

// =====================
// Batch Transaction Schema
// =====================

/**
 * 단일 배치 operation 스키마. 작성일: 2026-05-01
 * 각 type에 따라 필요한 필드를 검증합니다.
 */
export const batchOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createNode'), payload: createNodeEditorSchema }),
  z.object({ type: z.literal('updateNode'), nodeId: z.number().int().positive(), payload: updateNodeEditorSchema }),
  z.object({ type: z.literal('deleteNode'), nodeId: z.number().int().positive(), permanent: z.boolean().optional() }),
  z.object({ type: z.literal('createEdge'), payload: createEdgeEditorSchema }),
  z.object({ type: z.literal('updateEdge'), edgeId: z.string().min(1), payload: updateEdgeEditorSchema }),
  z.object({ type: z.literal('deleteEdge'), edgeId: z.string().min(1), permanent: z.boolean().optional() }),
  z.object({ type: z.literal('createCluster'), payload: createClusterEditorSchema }),
  z.object({ type: z.literal('updateCluster'), clusterId: z.string().min(1), payload: updateClusterEditorSchema }),
  z.object({ type: z.literal('deleteCluster'), clusterId: z.string().min(1), cascade: z.boolean().optional(), permanent: z.boolean().optional() }),
  z.object({ type: z.literal('createSubcluster'), payload: createSubclusterEditorSchema }),
  z.object({ type: z.literal('updateSubcluster'), subclusterId: z.string().min(1), payload: updateSubclusterEditorSchema }),
  z.object({ type: z.literal('deleteSubcluster'), subclusterId: z.string().min(1), permanent: z.boolean().optional() }),
  z.object({ type: z.literal('moveNodeToCluster'), nodeId: z.number().int().positive(), newClusterId: z.string().min(1) }),
  z.object({ type: z.literal('moveSubclusterToCluster'), subclusterId: z.string().min(1), newClusterId: z.string().min(1) }),
  z.object({ type: z.literal('addNodeToSubcluster'), subclusterId: z.string().min(1), nodeId: z.number().int().positive() }),
  z.object({ type: z.literal('removeNodeFromSubcluster'), subclusterId: z.string().min(1), nodeId: z.number().int().positive() }),
]);

/**
 * 배치 트랜잭션 요청 스키마. 작성일: 2026-05-01
 */
export const batchEditorRequestSchema = z.object({
  operations: z.array(batchOperationSchema).min(1).max(100),
});

// =====================
// Type exports (inferred from schemas)
// =====================
export type CreateNodeEditorInput = z.infer<typeof createNodeEditorSchema>;
export type UpdateNodeEditorInput = z.infer<typeof updateNodeEditorSchema>;
export type CreateEdgeEditorInput = z.infer<typeof createEdgeEditorSchema>;
export type UpdateEdgeEditorInput = z.infer<typeof updateEdgeEditorSchema>;
export type CreateClusterEditorInput = z.infer<typeof createClusterEditorSchema>;
export type UpdateClusterEditorInput = z.infer<typeof updateClusterEditorSchema>;
export type CreateSubclusterEditorInput = z.infer<typeof createSubclusterEditorSchema>;
export type UpdateSubclusterEditorInput = z.infer<typeof updateSubclusterEditorSchema>;
export type BatchEditorInput = z.infer<typeof batchEditorRequestSchema>;
