/**
 * Zod schemas for Graph endpoints. These live alongside DTO types in src/shared/dtos.
 * Controllers should import these schemas and types and let errors bubble to central handler.
 */

import { z } from 'zod';

import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  GraphSnapshotDto,
  GraphStatsDto,
  PersistGraphPayloadDto,
} from './graph';

/**
 * 스키마: 그래프 노드.
 */
export const graphNodeSchema = z.object({
  id: z.number().int(),
  userId: z.string().min(1),
  origId: z.string().min(1),
  clusterId: z.string().min(1),
  clusterName: z.string().min(1),
  timestamp: z.iso.datetime({ offset: true }).or(z.null()),
  numMessages: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  deletedAt: z.iso.datetime({ offset: true }).optional(),
}) satisfies z.ZodType<GraphNodeDto>;

/**
 * 스키마: 그래프 엣지.
 */
export const graphEdgeSchema = z.object({
  userId: z.string().min(1),
  id: z.string().min(1).optional(),
  source: z.number().int(),
  target: z.number().int(),
  weight: z.number().min(0).max(1),
  type: z.enum(['hard', 'insight']),
  intraCluster: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  deletedAt: z.iso.datetime({ offset: true }).optional(),
}) satisfies z.ZodType<GraphEdgeDto>;

/**
 * 스키마: 그래프 클러스터.
 */
export const graphClusterSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  size: z.number().int().nonnegative(),
  themes: z.array(z.string().min(1)).max(3),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  deletedAt: z.iso.datetime({ offset: true }).optional(),
}) satisfies z.ZodType<GraphClusterDto>;

/**
 * 스키마: 그래프 통계.
 */
export const graphStatsSchema = z.object({
  userId: z.string().min(1),
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  clusters: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<GraphStatsDto>;

/**
 * 스키마: 그래프 스냅샷(단일 사용자 기준).
 */
export const graphSnapshotSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  clusters: z.array(graphClusterSchema),
  stats: z.object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    clusters: z.number().int().nonnegative(),
    generatedAt: z.iso.datetime({ offset: true }).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
}) satisfies z.ZodType<GraphSnapshotDto>;

/**
 * 스키마: 그래프 전체 적재 요청.
 */
export const persistGraphPayloadSchema = z.object({
  userId: z.string().min(1),
  snapshot: graphSnapshotSchema,
}) satisfies z.ZodType<PersistGraphPayloadDto>;

export type GraphNodeSchema = typeof graphNodeSchema;
export type GraphEdgeSchema = typeof graphEdgeSchema;
export type GraphClusterSchema = typeof graphClusterSchema;
export type GraphStatsSchema = typeof graphStatsSchema;
export type GraphSnapshotSchema = typeof graphSnapshotSchema;
export type PersistGraphPayloadSchema = typeof persistGraphPayloadSchema;
