import type {
  GraphClusterRecord,
  GraphEdgeRecord,
  GraphNodeRecord,
  GraphStatsRecord,
  GraphStore,
  RepoOptions,
} from '../ports/GraphStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';

/**
 * GraphService: graph persistence and basic graph queries.
 * - Delegates to GraphStore (port) for DB operations.
 */
export class GraphService {
  constructor(private readonly repo: GraphStore) {}

  /**
   * 노드를 생성 또는 갱신한다.
   * @param node 저장할 노드 레코드
   * @throws {ValidationError | UpstreamError}
   */
  async upsertNode(node: GraphNodeRecord, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(node.userId);
      if (typeof node.id !== 'number') throw new ValidationError('node.id must be a number');
      await this.repo.upsertNode({ ...node, createdAt: node.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertNode failed', { cause: String(err) });
    }
  }

  /**
   * 노드 일부 속성을 갱신한다.
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   * @param patch 갱신할 필드
   * @throws {ValidationError | UpstreamError}
   */
  async updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeRecord>, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      this.assertNodeId(nodeId);
      await this.repo.updateNode(userId, nodeId, { ...patch, updatedAt: new Date().toISOString() }, options);
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
   */
  async findNode(userId: string, nodeId: number) {
    try {
      this.assertUser(userId);
      this.assertNodeId(nodeId);
      return await this.repo.findNode(userId, nodeId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findNode failed', { cause: String(err) });
    }
  }

  /**
   * 사용자 노드 목록을 반환한다.
   * @param userId 사용자 ID
   */
  async listNodes(userId: string) {
    try {
      this.assertUser(userId);
      return await this.repo.listNodes(userId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listNodes failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터의 노드 목록을 반환한다.
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   */
  async listNodesByCluster(userId: string, clusterId: string) {
    try {
      this.assertUser(userId);
      return await this.repo.listNodesByCluster(userId, clusterId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listNodesByCluster failed', { cause: String(err) });
    }
  }

  /**
   * 엣지를 생성 또는 갱신한다.
   * @param edge 저장할 엣지 레코드
   * @returns MongoDB 문서 ID
   */
  async upsertEdge(edge: GraphEdgeRecord, options?: RepoOptions): Promise<string> {
    try {
      this.assertUser(edge.userId);
      this.assertNodeId(edge.source);
      this.assertNodeId(edge.target);
      if (!['hard', 'insight'].includes(edge.type)) throw new ValidationError('edge.type must be hard or insight');
      return await this.repo.upsertEdge({ ...edge, createdAt: edge.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }, options);
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
   */
  async listEdges(userId: string) {
    try {
      this.assertUser(userId);
      return await this.repo.listEdges(userId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listEdges failed', { cause: String(err) });
    }
  }

  /**
   * 클러스터를 생성 또는 갱신한다.
   * @param cluster 클러스터 레코드
   */
  async upsertCluster(cluster: GraphClusterRecord, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(cluster.userId);
      if (!cluster.id) throw new ValidationError('cluster.id required');
      await this.repo.upsertCluster({ ...cluster, createdAt: cluster.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }, options);
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
   */
  async findCluster(userId: string, clusterId: string) {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');
      return await this.repo.findCluster(userId, clusterId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findCluster failed', { cause: String(err) });
    }
  }

  /**
   * 사용자 클러스터 목록을 반환한다.
   * @param userId 사용자 ID
   */
  async listClusters(userId: string) {
    try {
      this.assertUser(userId);
      return await this.repo.listClusters(userId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listClusters failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 통계를 저장한다.
   * @param stats 통계 레코드
   */
  async saveStats(stats: GraphStatsRecord, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(stats.userId);
      await this.repo.saveStats({ ...stats, generatedAt: stats.generatedAt ?? new Date().toISOString() }, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.saveStats failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 통계를 조회한다.
   * @param userId 사용자 ID
   */
  async getStats(userId: string) {
    try {
      this.assertUser(userId);
      return await this.repo.getStats(userId);
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
