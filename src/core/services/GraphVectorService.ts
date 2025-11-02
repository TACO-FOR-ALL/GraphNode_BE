
/**
 * GraphVectorService — orchestration utilities for Graph <-> Vector interactions
 *
 * 이 서비스는 실제 도메인 로직(검증/영속성)을 직접 수행하지 않습니다. 대신
 * GraphService와 VectorService 간의 조정, 배치 적용, 동기화/정합성 유틸리티
 * 를 제공합니다. 이렇게 레이어를 분리하면 즉시 적용, 배치 처리, 또는 아웃박스
 * 기반의 eventual consistency 중 원하는 전략을 선택하여 사용할 수 있습니다.
 */

import type { GraphService } from './GraphService';
import type { VectorService } from './VectorService';
import type { GraphNode } from '../ports/GraphStore';

export class GraphVectorService {
  constructor(private graphService: GraphService, private vectorService: VectorService) {}

  /**
   * Prepare a combined payload for creating a node and its vector.
   *
   * - Side-effect free: returns payloads only.
   * - Caller decides whether to persist immediately, batch, or enqueue.
   *
   * @param node Partial node fields; must include `id` and `userId`.
   * @param embedding Optional numeric embedding array.
   * @param meta Optional metadata to attach to vector payload.
   * @returns An object { nodePayload, vectorPayload } where vectorPayload may be null.
   * @throws Error when required identifiers are missing.
   */
  prepareNodeAndVector(node: Partial<GraphNode>, embedding?: number[], meta?: Record<string, any>) {
    if (!node.id) throw new Error('prepareNodeAndVector: node.id is required');
    if (!node.userId) throw new Error('prepareNodeAndVector: node.userId is required');

    const nodePayload: GraphNode = {
      id: node.id,
      userId: node.userId,
      title: (node as any).title ?? null,
      createdAt: (node as any).createdAt ?? new Date().toISOString(),
      updatedAt: (node as any).updatedAt ?? new Date().toISOString(),
      ...(node as any),
    } as GraphNode;

    const vectorPayload = embedding
      ? {
          collection: `user_${node.userId}_nodes`,
          items: [
            {
              id: node.id,
              vector: embedding,
              payload: { ...(meta ?? {}), userId: node.userId, nodeId: node.id },
            },
          ],
        }
      : null;

    return { nodePayload, vectorPayload } as const;
  }

  /**
   * Apply a small batch of node+vector prepared payloads.
   *
   * This two-phase helper:
   *  - Phase A: attempts to persist nodes via GraphService (best-effort)
   *  - Phase B: attempts to upsert vectors for successfully created nodes
   *
   * The function returns detailed results so callers can implement retries or
   * an outbox pattern when stronger guarantees are required.
   *
   * @param items Array of { nodePayload, vectorPayload } produced by prepareNodeAndVector
   */
  async applyBatchNodes(items: Array<{ nodePayload: GraphNode; vectorPayload: any | null }>) {
    const created: string[] = [];
    const vectorUpserted: string[] = [];
    const errors: any[] = [];

    // Phase A: persist nodes
    for (const it of items) {
      try {
        await this.graphService.createNode(it.nodePayload);
        created.push(it.nodePayload.id);
      } catch (err) {
        errors.push({ stage: 'graph.create', id: it.nodePayload.id, error: err });
      }
    }

    // Phase B: upsert vectors only for nodes that were created
    for (const it of items) {
      if (!it.vectorPayload) continue;
      if (!created.includes(it.nodePayload.id)) {
        errors.push({ stage: 'vector.skip_node_missing', id: it.nodePayload.id });
        continue;
      }
      try {
        // VectorService expects (userId, items)
        await this.vectorService.upsertForUser(it.nodePayload.userId, it.vectorPayload.items);
        vectorUpserted.push(it.nodePayload.id);
      } catch (err) {
        errors.push({ stage: 'vector.upsert', id: it.nodePayload.id, error: err });
      }
    }

    return { created, vectorUpserted, errors } as const;
  }

  /**
   * Search by vector and fetch corresponding graph nodes, merging results.
   *
   * This helper first queries the vector store for candidate node ids and
   * then loads nodes from GraphService. The returned array preserves the
   * vector result ordering and attaches the score.
   */
  async searchNodesByVector(userId: string, _collection: string | undefined, queryVector: number[], limit = 10) {
    // _collection is currently informational; VectorService uses a default collection
    const vecRes = await this.vectorService.searchForUser(userId, queryVector, { limit });
    const ids = vecRes.map(r => r.id);
    const nodes = await Promise.all(ids.map(id => this.graphService.getNodeById(id)));
    return ids.map((id, i) => ({ node: nodes[i] ?? null, score: vecRes[i]?.score ?? 0 }));
  }

  /**
   * Find nodes (by id list) that do not yet have vector entries.
   *
   * Note: naive implementation that queries for each id; suitable for
   * small batches. For large-scale reconciliation use an index or metadata
   * approach and/or run in a worker with pagination.
   */
  async findNodesMissingVectors(userId: string, collection: string, nodeIds: string[]) {
    const missing: string[] = [];
    for (const id of nodeIds) {
      try {
  const res = await this.vectorService.searchForUser(userId, [0], { filter: { nodeId: id }, limit: 1 });
        if (!res || res.length === 0) missing.push(id);
      } catch (err) {
        missing.push(id);
      }
    }
    return missing;
  }
}
