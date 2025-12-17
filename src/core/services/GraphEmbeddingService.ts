/**
 * 모듈: GraphEmbeddingService (그래프-벡터 통합 서비스)
 * 
 * 책임:
 * - GraphManagementService와 VectorService 간의 조율(Orchestration)을 담당합니다.
 * - 그래프 데이터 변경 시 벡터 데이터도 함께 변경하거나, 정합성을 맞추는 역할을 합니다.
 * - 현재는 벡터 기능이 비활성화되어 있어 대부분의 메서드가 에러를 발생시키거나 비어있습니다.
 * 
 * 설계 의도:
 * - 도메인 로직(GraphManagementService)과 벡터 동기화 로직을 분리하여,
 * - 필요에 따라 동기화 전략(실시간, 배치, 이벤트 기반 등)을 유연하게 변경할 수 있도록 합니다.
 */

import type { GraphManagementService } from './GraphManagementService';
import type { VectorService } from './VectorService';
import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  GraphStatsDto,
  GraphSnapshotDto,
  PersistGraphPayloadDto
} from '../../shared/dtos/graph';
import { getMongo } from '../../infra/db/mongodb';

export class GraphEmbeddingService {
  constructor(public readonly graphManagementService: GraphManagementService, private readonly vectorService?: VectorService) {}

  /**
   * 벡터 관련 기능이 비활성화되었음을 알리는 예외를 발생시킵니다.
   * @deprecated 벡터 동기화 기능은 현재 요구사항에서 제외되었습니다.
   */
  private throwVectorDisabledError() {
    throw new Error('Vector operations are temporarily disabled');
  }

  /**
   * 노드와 벡터 데이터를 준비합니다. (현재 비활성화)
   * @deprecated 벡터 동기화 기능은 현재 요구사항에서 제외되었습니다.
   */
  async prepareNodeAndVector(_node: Partial<GraphNodeDto>, _embedding?: number[], _meta?: Record<string, unknown>) {
    this.throwVectorDisabledError();
  }

  /**
   * 여러 노드를 일괄적으로 적용합니다. (현재 비활성화)
   * @deprecated 벡터 동기화 기능은 현재 요구사항에서 제외되었습니다.
   */
  async applyBatchNodes(_items: Array<{ nodePayload: GraphNodeDto; vectorPayload: unknown }>) {
    this.throwVectorDisabledError();
  }

  /**
   * 벡터 검색을 통해 노드를 찾습니다. (현재 비활성화)
   * @deprecated 벡터 검색 기능은 비활성화되었습니다.
   */
  async searchNodesByVector(_userId: string, _collection: string | undefined, _queryVector: number[], _limit = 10) {
    this.throwVectorDisabledError();
  }

  /**
   * 벡터가 누락된 노드를 찾습니다. (현재 비활성화)
   * @deprecated 벡터 정합성 검증은 비활성화되었습니다.
   */
  async findNodesMissingVectors(_userId: string, _collection: string, _nodeIds: Array<number | string>) {
    this.throwVectorDisabledError();
  }

  /**
   * 그래프 노드를 생성하거나 갱신합니다.
   * 
   * 단순히 GraphService의 메서드를 호출하여 위임합니다.
   * (추후 벡터 동기화 로직이 추가될 수 있는 지점입니다)
   * 
   * @param node - 저장할 노드 데이터. `userId`와 `id`는 필수입니다.
   * @returns Promise<void>
   * @throws {ValidationError | UpstreamError} - 유효성 검사 실패 또는 DB 오류 발생 시
   */
  upsertNode(node: GraphNodeDto) {
    return this.graphManagementService.upsertNode(node);
  }

  /**
   * 기존 그래프 노드의 일부 속성을 갱신합니다.
   * 
   * @param userId - 작업을 요청한 사용자 ID
   * @param nodeId - 갱신할 노드의 ID
   * @param patch - 갱신할 속성 객체
   * @returns Promise<void>
   * @throws {NotFoundError | UpstreamError} - 노드가 없거나 DB 오류 발생 시
   */
  updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeDto>) {
    return this.graphManagementService.updateNode(userId, nodeId, patch);
  }

  /**
   * 특정 노드를 삭제합니다.
   * 
   * 이 메서드는 단일 노드만 삭제하며, 연결된 엣지는 `GraphService` 또는 `GraphRepository` 레벨에서 처리됩니다.
   * 
   * @param userId - 작업을 요청한 사용자 ID
   * @param nodeId - 삭제할 노드의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   * @see removeNodeCascade - 노드와 연결된 모든 엣지를 함께 삭제하려면 이 메서드를 사용하세요.
   */
  deleteNode(userId: string, nodeId: number) {
    return this.graphManagementService.deleteNode(userId, nodeId);
  }

  /**
   * 특정 노드를 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param nodeId - 조회할 노드의 ID
   * @returns 조회된 노드 객체. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  findNode(userId: string, nodeId: number) {
    return this.graphManagementService.findNode(userId, nodeId);
  }

  /**
   * 특정 사용자의 모든 노드 목록을 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 노드 객체 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  listNodes(userId: string) {
    return this.graphManagementService.listNodes(userId);
  }

  /**
   * 그래프 엣지를 생성하거나 갱신합니다.
   * @param edge - 저장할 엣지 데이터. `userId`, `source`, `target`은 필수입니다.
   * @returns 생성된 엣지의 고유 ID
   * @throws {ValidationError | UpstreamError} - 유효성 검사 실패 또는 DB 오류 발생 시
   */
  upsertEdge(edge: GraphEdgeDto) {
    return this.graphManagementService.upsertEdge(edge);
  }

  /**
   * 특정 엣지를 ID로 삭제합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param edgeId - 삭제할 엣지의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  deleteEdge(userId: string, edgeId: string) {
    return this.graphManagementService.deleteEdge(userId, edgeId);
  }

  /**
   * 두 노드 사이에 있는 모든 엣지를 삭제합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param source - 출발 노드 ID
   * @param target - 도착 노드 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  deleteEdgeBetween(userId: string, source: number, target: number) {
    return this.graphManagementService.deleteEdgeBetween(userId, source, target);
  }

  /**
   * 특정 사용자의 모든 엣지 목록을 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 엣지 객체 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  listEdges(userId: string) {
    return this.graphManagementService.listEdges(userId);
  }

  /**
   * 그래프 클러스터를 생성하거나 갱신합니다.
   * 
   * 이 작업은 트랜잭션 내에서 실행되어 원자성을 보장합니다.
   * 
   * @param cluster - 저장할 클러스터 데이터. `userId`와 `id`는 필수입니다.
   * @returns Promise<void>
   * @throws {ValidationError | UpstreamError} - 유효성 검사 실패 또는 DB 오류 발생 시
   */
  async upsertCluster(cluster: GraphClusterDto): Promise<void> {
    const mongoClient = getMongo();
    if (!mongoClient) {
      throw new Error('MongoDB client is not initialized. Cannot start a transaction.');
    }
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await this.graphManagementService.upsertCluster(cluster, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 특정 클러스터를 삭제합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param clusterId - 삭제할 클러스터의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   * @see removeClusterCascade - 클러스터와 속한 모든 노드/엣지를 삭제하려면 이 메서드를 사용하세요.
   */
  async deleteCluster(userId: string, clusterId: string): Promise<void> {
    const mongoClient = getMongo();
    if (!mongoClient) {
      throw new Error('MongoDB client is not initialized. Cannot start a transaction.');
    }
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await this.graphManagementService.deleteCluster(userId, clusterId, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 특정 클러스터를 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param clusterId - 조회할 클러스터의 ID
   * @returns 조회된 클러스터 객체. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  findCluster(userId: string, clusterId: string) {
    return this.graphManagementService.findCluster(userId, clusterId);
  }

  /**
   * 특정 사용자의 모든 클러스터 목록을 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 클러스터 객체 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  listClusters(userId: string) {
    return this.graphManagementService.listClusters(userId);
  }

  /**
   * 그래프 통계를 저장합니다.
   * @param stats - 저장할 통계 데이터. `userId`는 필수입니다.
   * @returns Promise<void>
   * @throws {ValidationError | UpstreamError} - 유효성 검사 실패 또는 DB 오류 발생 시
   */
  saveStats(stats: GraphStatsDto) {
    return this.graphManagementService.saveStats(stats);
  }

  /**
   * 특정 사용자의 그래프 통계를 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 조회된 통계 객체. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  getStats(userId: string) {
    return this.graphManagementService.getStats(userId);
  }

  /**
   * 특정 사용자의 그래프 통계를 삭제합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  deleteStats(userId: string) {
    return this.graphManagementService.deleteStats(userId);
  }

  /**
   * 특정 노드와 연결된 모든 엣지를 함께 삭제합니다. (Cascade)
   * 
   * 이 메서드는 `GraphService.deleteNode`를 호출하며, 해당 서비스의 레포지토리 구현체에서
   * 노드와 엣지를 트랜잭션처럼 처리하는 로직에 의존합니다.
   * 
   * @param userId - 작업을 요청한 사용자 ID
   * @param nodeId - 삭제할 노드의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 작업 중 오류 발생 시
   * @example
   * // 노드 5와 연결된 모든 엣지를 함께 삭제
   * await service.removeNodeCascade('u-123', 5);
   */
  async removeNodeCascade(userId: string, nodeId: number): Promise<void> {
    // GraphRepositoryMongo.deleteNode 에 이미 관련 엣지 삭제 로직이 포함되어 있음
    await this.graphManagementService.deleteNode(userId, nodeId);
  }

  /**
   * 특정 클러스터와 그에 속한 모든 노드 및 관련 엣지를 삭제합니다. (Cascade)
   * 
   * 이 작업은 여러 단계로 이루어지며, 부분적으로만 성공할 수 있는 위험이 있습니다.
   * 따라서 MongoDB 트랜잭션을 사용하여 원자적으로 처리됩니다.
   * 
   * @param userId - 작업을 요청한 사용자 ID
   * @param clusterId - 삭제할 클러스터의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 작업 중 오류 발생 시
   */
  async removeClusterCascade(userId: string, clusterId: string): Promise<void> {
    const mongoClient = getMongo();
    if (!mongoClient) {
      throw new Error('MongoDB client is not initialized. Cannot start a transaction.');
    }
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        const nodesInCluster = await this.graphManagementService.listNodesByCluster(userId, clusterId);
        if (nodesInCluster.length > 0) {
          const nodeIds = nodesInCluster.map(n => n.id);
          // 1. 클러스터에 속한 모든 노드와 관련 엣지 삭제
          await this.graphManagementService.deleteEdgesByNodeIds(userId, nodeIds, { session });
          await this.graphManagementService.deleteNodes(userId, nodeIds, { session });
        }
        // 2. 클러스터 자체 삭제
        await this.graphManagementService.deleteCluster(userId, clusterId, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 특정 사용자의 전체 그래프 데이터를 스냅샷 형태로 조회합니다.
   * 
   * @param userId - 조회할 사용자 ID
   * @returns 그래프 스냅샷 DTO. 데이터가 없으면 각 배열은 비어있고, stats는 null일 수 있습니다.
   * @throws {UpstreamError} - DB 조회 중 오류 발생 시
   */
  async getSnapshotForUser(userId: string): Promise<GraphSnapshotDto> {
    const [nodes, edges, clusters, stats] = await Promise.all([
      this.graphManagementService.listNodes(userId),
      this.graphManagementService.listEdges(userId),
      this.graphManagementService.listClusters(userId),
      this.graphManagementService.getStats(userId),
    ]);

    return {
      nodes,
      edges,
      clusters,
      stats: stats ? { nodes: stats.nodes, edges: stats.edges, clusters: stats.clusters } : { nodes: 0, edges: 0, clusters: 0 },
    };
  }

  /**
   * 그래프 스냅샷 데이터를 DB에 일괄적으로 저장(upsert)합니다.
   * 
   * 이 메서드는 여러 데이터를 병렬로 처리하며, 전체 작업의 원자성을 보장하기 위해
   * MongoDB 트랜잭션을 사용합니다.
   * 
   * @param payload - 사용자 ID와 그래프 스냅샷 데이터
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 저장 중 오류 발생 시
   */
  async persistSnapshot(payload: PersistGraphPayloadDto): Promise<void> {
    const mongoClient = getMongo();
    if (!mongoClient) {
      throw new Error('MongoDB client is not initialized. Cannot start a transaction.');
    }
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        const { userId, snapshot } = payload;

        const upsertPromises = [
          ...snapshot.nodes.map(node => this.graphManagementService.upsertNode({ ...node, userId }, { session })),
          ...snapshot.edges.map(edge => this.graphManagementService.upsertEdge({ ...edge, userId }, { session })),
          ...snapshot.clusters.map(cluster => this.graphManagementService.upsertCluster({ ...cluster, userId }, { session })),
          this.graphManagementService.saveStats({ ...snapshot.stats, userId }, { session }),
        ];

        await Promise.all(upsertPromises);
      });
    } finally {
      await session.endSession();
    }
  }
}
