import type { GraphStore, RepoOptions } from '../ports/GraphStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';
import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  GraphStatsDto,
} from '../../shared/dtos/graph';
import {
  toGraphClusterDoc,
  toGraphClusterDto,
  toGraphEdgeDoc,
  toGraphEdgeDto,
  toGraphNodeDoc,
  toGraphNodeDto,
  toGraphStatsDoc,
  toGraphStatsDto,
} from '../../shared/mappers/graph';

/**
 * GraphService: graph persistence and basic graph queries.
 * - Delegates to GraphStore (port) for DB operations.
 * - **Rule 1**: Service handles DTOs/Domain objects and uses Mappers to talk to Repo (which uses Docs).
 */
export class GraphService {
  constructor(private readonly repo: GraphStore) {}

  /**
   * 노드를 생성 또는 갱신한다.
   * @param node 저장할 노드 DTO
   * @throws {ValidationError | UpstreamError}
   */
  async upsertNode(node: GraphNodeDto, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(node.userId);
      if (typeof node.id !== 'number') throw new ValidationError('node.id must be a number');
      const doc = toGraphNodeDoc(node);
      await this.repo.upsertNode(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertNode failed', { cause: String(err) });
    }
  }

  /**
   * 노드 일부 속성을 갱신한다.
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   * @param patch 갱신할 필드 (DTO Partial)
   * @throws {ValidationError | UpstreamError}
   */
  async updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeDto>, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      this.assertNodeId(nodeId);
      // Partial DTO -> Partial Doc mapping is tricky.
      // For now, we assume simple field mapping or we might need a specific mapper for partials.
      // Since our mapper is simple, we can just cast or map manually for now.
      // Ideally, we should have `toGraphNodeDocPartial`.
      // Let's do a manual map for now as it's safer.
      const patchDoc: any = { ...patch };
      if (patch.updatedAt) patchDoc.updatedAt = patch.updatedAt;
      
      await this.repo.updateNode(userId, nodeId, patchDoc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * 노드와 관련 엣지를 삭제한다.
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   */
  async deleteNode(userId: string, nodeId: number, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      this.assertNodeId(nodeId);
      await this.repo.deleteNode(userId, nodeId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteNode failed', { cause: String(err) });
    }
  }

  /**
   * 여러 노드를 삭제한다.
   * @param userId 사용자 ID
   * @param nodeIds 노드 ID 배열
   * @param options 트랜잭션 옵션
   */
  async deleteNodes(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteNodes(userId, nodeIds, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteNodes failed', { cause: String(err) });
    }
  }

  /**
   * 단일 노드를 조회한다.
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   * @returns GraphNodeDto or null
   */
  async findNode(userId: string, nodeId: number): Promise<GraphNodeDto | null> {
    try {
      this.assertUser(userId);
      this.assertNodeId(nodeId);
      const doc = await this.repo.findNode(userId, nodeId);
      return doc ? toGraphNodeDto(doc) : null;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findNode failed', { cause: String(err) });
    }
  }

  /**
   * 사용자 노드 목록을 반환한다.
   * @param userId 사용자 ID
   * @returns GraphNodeDto[]
   */
  async listNodes(userId: string): Promise<GraphNodeDto[]> {
    try {
      this.assertUser(userId);
      const docs = await this.repo.listNodes(userId);
      return docs.map(toGraphNodeDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listNodes failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터의 노드 목록을 반환한다.
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns GraphNodeDto[]
   */
  async listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDto[]> {
    try {
      this.assertUser(userId);
      const docs = await this.repo.listNodesByCluster(userId, clusterId);
      return docs.map(toGraphNodeDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listNodesByCluster failed', { cause: String(err) });
    }
  }

  /**
   * 엣지를 생성 또는 갱신한다.
   * @param edge 저장할 엣지 DTO
   * @returns MongoDB 문서 ID
   */
  async upsertEdge(edge: GraphEdgeDto, options?: RepoOptions): Promise<string> {
    try {
      this.assertUser(edge.userId);
      this.assertNodeId(edge.source);
      this.assertNodeId(edge.target);
      if (!['hard', 'insight'].includes(edge.type)) throw new ValidationError('edge.type must be hard or insight');
      const doc = toGraphEdgeDoc(edge);
      return await this.repo.upsertEdge(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertEdge failed', { cause: String(err) });
    }
  }

  /**
   * 엣지를 삭제한다.
   * @param userId 사용자 ID
   * @param edgeId 엣지 문서 ID
   */
  async deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      if (!edgeId) throw new ValidationError('edgeId required');
      await this.repo.deleteEdge(userId, edgeId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteEdge failed', { cause: String(err) });
    }
  }

  /**
   * 두 노드 사이의 엣지를 삭제한다.
   * @param userId 사용자 ID
   * @param source 출발 노드 ID
   * @param target 도착 노드 ID
   */
  async deleteEdgeBetween(userId: string, source: number, target: number, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      this.assertNodeId(source);
      this.assertNodeId(target);
      await this.repo.deleteEdgeBetween(userId, source, target, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteEdgeBetween failed', { cause: String(err) });
    }
  }

  /**
   * 여러 노드에 연결된 엣지를 삭제한다.
   * @param userId 사용자 ID
   * @param nodeIds 노드 ID 배열
   * @param options 트랜잭션 옵션
   */
  async deleteEdgesByNodeIds(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteEdgesByNodeIds(userId, nodeIds, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteEdgesByNodeIds failed', { cause: String(err) });
    }
  }

  /**
   * 사용자 엣지 목록을 반환한다.
   * @param userId 사용자 ID
   * @returns GraphEdgeDto[]
   */
  async listEdges(userId: string): Promise<GraphEdgeDto[]> {
    try {
      this.assertUser(userId);
      const docs = await this.repo.listEdges(userId);
      return docs.map(toGraphEdgeDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listEdges failed', { cause: String(err) });
    }
  }

  /**
   * 클러스터를 생성 또는 갱신한다.
   * @param cluster 클러스터 DTO
   */
  async upsertCluster(cluster: GraphClusterDto, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(cluster.userId);
      if (!cluster.id) throw new ValidationError('cluster.id required');
      const doc = toGraphClusterDoc(cluster);
      await this.repo.upsertCluster(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertCluster failed', { cause: String(err) });
    }
  }

  /**
   * 클러스터를 삭제한다.
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   */
  async deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');
      await this.repo.deleteCluster(userId, clusterId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteCluster failed', { cause: String(err) });
    }
  }

  /**
   * 클러스터 단건을 조회한다.
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns GraphClusterDto or null
   */
  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDto | null> {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');
      const doc = await this.repo.findCluster(userId, clusterId);
      return doc ? toGraphClusterDto(doc) : null;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findCluster failed', { cause: String(err) });
    }
  }

  /**
   * 사용자 클러스터 목록을 반환한다.
   * @param userId 사용자 ID
   * @returns GraphClusterDto[]
   */
  async listClusters(userId: string): Promise<GraphClusterDto[]> {
    try {
      this.assertUser(userId);
      const docs = await this.repo.listClusters(userId);
      return docs.map(toGraphClusterDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listClusters failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 통계를 저장한다.
   * @param stats 통계 DTO
   */
  async saveStats(stats: GraphStatsDto, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(stats.userId);
      const doc = toGraphStatsDoc(stats);
      await this.repo.saveStats(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.saveStats failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 통계를 조회한다.
   * @param userId 사용자 ID
   * @returns GraphStatsDto or null
   */
  async getStats(userId: string): Promise<GraphStatsDto | null> {
    try {
      this.assertUser(userId);
      const doc = await this.repo.getStats(userId);
      return doc ? toGraphStatsDto(doc) : null;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.getStats failed', { cause: String(err) });
    }
  }

  /**
   * 통계를 삭제한다.
   * @param userId 사용자 ID
   */
  async deleteStats(userId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteStats(userId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteStats failed', { cause: String(err) });
    }
  }

  private assertUser(userId: string | undefined): asserts userId is string {
    if (!userId) throw new ValidationError('userId required');
  }

  private assertNodeId(nodeId: number | undefined): asserts nodeId is number {
    if (typeof nodeId !== 'number' || Number.isNaN(nodeId)) throw new ValidationError('nodeId must be a number');
  }
}
