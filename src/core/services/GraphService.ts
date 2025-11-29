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
 * 모듈: GraphService (그래프 서비스)
 * 
 * 책임:
 * - 그래프 데이터(노드, 엣지, 클러스터)의 비즈니스 로직을 처리합니다.
 * - DTO(Data Transfer Object)를 사용하여 데이터를 주고받습니다.
 * - GraphStore(Port)를 통해 DB 작업을 수행하며, 이 과정에서 Mapper를 사용해 DTO <-> Doc 변환을 수행합니다.
 */
export class GraphService {
  constructor(private readonly repo: GraphStore) {}

  /**
   * 노드 생성 또는 업데이트 (Upsert)
   * 
   * @param node 저장할 노드 DTO
   * @param options (선택) 트랜잭션 옵션
   * @throws {ValidationError} 유효하지 않은 데이터일 경우
   * @throws {UpstreamError} DB 작업 실패 시
   */
  async upsertNode(node: GraphNodeDto, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(node.userId);
      if (typeof node.id !== 'number') throw new ValidationError('node.id must be a number');
      
      // DTO -> Doc 변환 후 저장
      const doc = toGraphNodeDoc(node);
      await this.repo.upsertNode(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertNode failed', { cause: String(err) });
    }
  }

  /**
   * 노드 정보 부분 업데이트
   * 
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   * @param patch 업데이트할 필드들
   * @param options (선택) 트랜잭션 옵션
   */
  async updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeDto>, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      this.assertNodeId(nodeId);
      
      // 부분 업데이트를 위한 간단한 매핑
      const patchDoc: any = { ...patch };
      if (patch.updatedAt) patchDoc.updatedAt = patch.updatedAt;
      
      await this.repo.updateNode(userId, nodeId, patchDoc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * 노드 삭제
   * 
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
   * 여러 노드 일괄 삭제
   * 
   * @param userId 사용자 ID
   * @param nodeIds 삭제할 노드 ID 배열
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
   * 노드 단건 조회
   * 
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   * @returns GraphNodeDto 또는 null
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
   * 전체 노드 목록 조회
   * 
   * @param userId 사용자 ID
   * @returns GraphNodeDto 배열
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
   * 특정 클러스터의 노드 목록 조회
   * 
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns GraphNodeDto 배열
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
   * 엣지 생성 또는 업데이트 (Upsert)
   * 
   * @param edge 저장할 엣지 DTO
   * @returns 생성된 엣지의 ID
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
   * 엣지 삭제
   * 
   * @param userId 사용자 ID
   * @param edgeId 엣지 ID
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
   * 두 노드 사이의 엣지 삭제
   * 
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
   * 특정 노드들과 연결된 엣지 일괄 삭제
   * 
   * @param userId 사용자 ID
   * @param nodeIds 노드 ID 배열
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
   * 전체 엣지 목록 조회
   * 
   * @param userId 사용자 ID
   * @returns GraphEdgeDto 배열
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
   * 클러스터 생성 또는 업데이트
   * 
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
   * 클러스터 삭제
   * 
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
   * 클러스터 단건 조회
   * 
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns GraphClusterDto 또는 null
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
   * 전체 클러스터 목록 조회
   * 
   * @param userId 사용자 ID
   * @returns GraphClusterDto 배열
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
   * 그래프 통계 저장
   * 
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
   * 그래프 통계 조회
   * 
   * @param userId 사용자 ID
   * @returns GraphStatsDto 또는 null
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
   * 그래프 통계 삭제
   * 
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

  // --- 내부 헬퍼 메서드 ---

  private assertUser(userId: string | undefined): asserts userId is string {
    if (!userId) throw new ValidationError('userId required');
  }

  private assertNodeId(nodeId: number | undefined): asserts nodeId is number {
    if (typeof nodeId !== 'number' || Number.isNaN(nodeId)) throw new ValidationError('nodeId must be a number');
  }
}
