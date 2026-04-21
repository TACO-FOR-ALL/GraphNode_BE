import {
  GraphNodeDto,
  GraphClusterDto,
  GraphEdgeDto,
  GraphStatsDto,
  GraphSubclusterDto,
  GraphSnapshotDto,
  PersistGraphPayloadDto,
} from '../../shared/dtos/graph';
import type { VectorStore } from '../ports/VectorStore';
import { getMongo } from '../../infra/db/mongodb';
import { ClientSession } from 'mongodb';
import { GraphManagementService } from './GraphManagementService';
import { ConversationService } from './ConversationService';
import { NoteService } from './NoteService';
import {
  GraphNodeDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../types/persistence/graph.persistence';
import { withRetry } from '../../shared/utils/retry';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * @class GraphEmbeddingService
 * @description
 * 그래프 도메인의 외부 공통 진입점(Facade).
 *
 * 역할:
 * - Controller/Worker에서 그래프 기능을 호출하는 단일 창구
 * - MongoDB 트랜잭션 컨텍스트를 제공하고 GraphManagementService 호출을 조율
 * - 스냅샷 조회(getSnapshotForUser) 시:
 *   - nodes에 clusterName을 cluster join({ userId, clusterId })으로 실시간 주입
 *   - stats.nodes/edges/clusters를 countNodes/countEdges/countClusters 실시간 계산으로 대체
 * - summary 조회(getGraphSummary) 시:
 *   - total_source_nodes/total_conversations/total_notes를 실시간 count로 덮어씀
 * - GraphVectorService(ChromaDB)와의 동기화 조율
 *
 * 금지: GraphManagementService를 이 클래스를 거치지 않고 외부에서 직접 호출 금지.
 */
export class GraphEmbeddingService {
  constructor(
    private readonly graphManagementService: GraphManagementService,
    private readonly vectorStore?: VectorStore,
    private readonly conversationService?: ConversationService,
    private readonly noteService?: NoteService
  ) {}

  /**
   * MongoDB 트랜잭션 컨텍스트를 생성하고 주어진 함수를 실행합니다.
   * 중복 트랜잭션 보일러플레이트를 통합한 내부 헬퍼입니다.
   *
   * @param label withRetry 로깅에 사용할 레이블
   * @param fn 트랜잭션 세션을 받아 실행할 비동기 함수
   * @returns fn의 반환값
   */
  /**
   * 트랜잭션 시작/종료와 재시도 정책을 공통화하는 내부 헬퍼입니다.
   *
   * 배경:
   * - 2026-04-21 구조 정리에서 GraphEmbeddingService가 트랜잭션 경계를 담당하고,
   *   GraphManagementService는 순수 도메인 연산에 집중하도록 역할을 분리했습니다.
   * - 이에 따라 여러 public 메서드에 반복되던 세션 생성, `withTransaction`, `withRetry`,
   *   세션 종료 코드를 한 곳으로 모았습니다.
   *
   * 목적:
   * - MongoDB 세션 생명주기를 중앙 관리합니다.
   * - transient transaction error 재시도 정책을 통일합니다.
   * - 개별 메서드는 비즈니스 의도만 보이도록 단순화합니다.
   *
   * 작성일: 2026-04-21
   *
   * @param label 재시도 로그 및 추적용 레이블
   * @param fn 세션을 받아 실제 작업을 수행하는 콜백
   * @returns 콜백이 반환한 결과
   */
  private async runInTransaction<T>(
    label: string,
    fn: (session: ClientSession) => Promise<T>
  ): Promise<T> {
    // 애플리케이션 전역 Mongo 클라이언트를 꺼내 트랜잭션 세션을 시작합니다.
    const mongoClient = getMongo();
    if (!mongoClient) {
      throw new Error('MongoDB client is not initialized. Cannot start a transaction.');
    }
    // 호출마다 독립 세션을 사용해 다른 요청의 트랜잭션과 경계를 분리합니다.
    const session = mongoClient.startSession();
    try {
      let result!: T;
      await withRetry(
        async () => {
          // MongoDB가 transient label을 붙인 오류는 전체 트랜잭션 블록을 재시도합니다.
          await session.withTransaction(async () => {
            // 실제 도메인 연산은 호출자가 넘긴 콜백에서 수행합니다.
            result = await fn(session);
          });
        },
        { label }
      );
      // 커밋까지 성공한 경우에만 결과를 반환합니다.
      return result;
    } finally {
      // 성공/실패와 관계없이 세션은 반드시 종료합니다.
      await session.endSession();
    }
  }

  /**
   * 내부 원문 노드 문서를 스냅샷 응답용 노드 DTO 초안으로 바꿉니다.
   *
   * 배경:
   * - membership 원본이 `GraphNodeDoc.subclusterId`로 이동하면서 `getSnapshotForUser`는
   *   DTO가 아니라 Doc 기준으로 노드를 읽게 되었습니다.
   * - FE/SDK 계약은 유지해야 하므로, 응답 직전 DTO 형태로 다시 정규화하는 단계가 필요합니다.
   *
   * 목적:
   * - Doc과 DTO의 역할을 분리합니다.
   * - `clusterName`은 DB 저장값이 아니라 이후 join 단계에서 채워진다는 점을 명시합니다.
   * - 삭제 시각은 FE 계약에 맞는 ISO 문자열로 변환합니다.
   *
   * 작성일: 2026-04-21
   *
   * @param doc 원문 노드 문서
   * @returns 스냅샷 조립 중간 단계의 노드 DTO
   */
  private toSnapshotNode(doc: GraphNodeDoc): GraphNodeDto {
    return {
      // 노드 자체 식별자와 사용자 범위를 그대로 전달합니다.
      id: doc.id,
      userId: doc.userId,
      // 원본 conversation/note/notion 식별자를 그대로 유지합니다.
      origId: doc.origId,
      // 현재 노드가 속한 cluster membership의 원본입니다.
      clusterId: doc.clusterId,
      // clusterName은 DB에 저장하지 않으므로 이후 join 단계에서 채웁니다.
      clusterName: '',
      // 시계열/집계 정보는 노드 문서 값을 그대로 사용합니다.
      timestamp: doc.timestamp,
      numMessages: doc.numMessages,
      sourceType: doc.sourceType,
      embedding: doc.embedding,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      // soft delete 정보가 있으면 FE 계약에 맞게 ISO 문자열로 변환합니다.
      ...(doc.deletedAt != null && { deletedAt: new Date(doc.deletedAt).toISOString() }),
    };
  }

  /**
   * 활성 노드 목록만으로 클러스터별 실제 노드 수를 계산합니다.
   *
   * 배경:
   * - `GraphClusterDoc.size`는 저장 시점의 캐시이므로 노드 삭제/복구 후 stale할 수 있습니다.
   * - 1차 전환 단계에서는 FE DTO의 `size` 필드는 유지하되 값은 실시간 active node 기준으로 재계산합니다.
   *
   * 작성일: 2026-04-21
   *
   * @param nodeDocs 활성 노드 문서 목록
   * @returns `clusterId -> active node count` 맵
   */
  private buildClusterNodeCounts(nodeDocs: GraphNodeDoc[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const node of nodeDocs) {
      // 같은 clusterId를 가진 활성 노드 수를 1씩 누적합니다.
      counts.set(node.clusterId, (counts.get(node.clusterId) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * 서브클러스터 DTO를 active node 기준으로 재조립합니다.
   *
   * 배경:
   * - 2026-04-21부터 membership의 원본은 `GraphNodeDoc.subclusterId`입니다.
   * - 그러나 1차 배포 시점에는 legacy `graph_subclusters.nodeIds`가 DB에 남아 있을 수 있으므로,
   *   백필 없이도 읽기 호환이 되도록 신구 데이터를 함께 해석해야 합니다.
   *
   * 목적:
   * - `node.subclusterId`를 우선 신뢰합니다.
   * - legacy `subcluster.nodeIds`는 backward compatibility fallback으로만 사용합니다.
   * - FE/SDK가 기대하는 `nodeIds`, `size`, `representativeNodeId` 구조는 그대로 유지합니다.
   *
   * 작성일: 2026-04-21
   *
   * @param nodeDocs 활성 노드 문서 목록
   * @param subclusterDocs 활성 서브클러스터 문서 목록
   * @returns FE/SDK 응답용 서브클러스터 DTO 배열
   */
  private buildSnapshotSubclusters(
    nodeDocs: GraphNodeDoc[],
    subclusterDocs: GraphSubclusterDoc[]
  ): GraphSubclusterDto[] {
    // 활성 노드만 membership 계산 대상으로 삼기 위해 ID 집합을 먼저 만듭니다.
    const activeNodeIds = new Set(nodeDocs.map((node) => node.id));
    // legacy fallback 해석 시 빠르게 현재 노드 문서를 찾기 위한 lookup map입니다.
    const activeNodesById = new Map(nodeDocs.map((node) => [node.id, node]));
    // 신 구조 membership 원본인 node.subclusterId로 subcluster -> nodeIds를 구축합니다.
    const membersBySubclusterId = new Map<string, Set<number>>();

    for (const node of nodeDocs) {
      // 아직 서브클러스터가 없는 노드는 건너뜁니다.
      if (!node.subclusterId) continue;
      // Set을 사용해 중복 membership을 자동으로 제거합니다.
      const memberIds = membersBySubclusterId.get(node.subclusterId) ?? new Set<number>();
      memberIds.add(node.id);
      membersBySubclusterId.set(node.subclusterId, memberIds);
    }

    return subclusterDocs
      .map((subcluster) => {
        // 신 구조 membership을 우선값으로 가져옵니다.
        const memberIds = new Set(membersBySubclusterId.get(subcluster.id) ?? []);

        for (const legacyNodeId of subcluster.nodeIds || []) {
          // legacy 배열에 있어도 현재 활성 노드가 아니면 응답에서 제거합니다.
          if (!activeNodeIds.has(legacyNodeId)) continue;
          const activeNode = activeNodesById.get(legacyNodeId);
          // 노드 문서에 이미 다른 subclusterId가 있으면 node 문서를 우선합니다.
          if (activeNode?.subclusterId && activeNode.subclusterId !== subcluster.id) continue;
          // 그 외 legacy 데이터는 backward compatibility를 위해 병합합니다.
          memberIds.add(legacyNodeId);
        }

        // FE 계약을 위해 정렬된 배열로 정규화합니다.
        const nodeIds = Array.from(memberIds).sort((a, b) => a - b);
        // 활성 멤버가 하나도 없으면 유령 subcluster이므로 응답에서 제거합니다.
        if (nodeIds.length === 0) return null;

        return {
          id: subcluster.id,
          clusterId: subcluster.clusterId,
          nodeIds,
          // 대표 노드가 유효하면 유지하고, 아니면 첫 번째 활성 노드로 보정합니다.
          representativeNodeId: nodeIds.includes(subcluster.representativeNodeId)
            ? subcluster.representativeNodeId
            : nodeIds[0],
          // 응답 size는 실제 활성 membership 수를 사용합니다.
          size: nodeIds.length,
          density: subcluster.density,
          topKeywords: subcluster.topKeywords,
          // soft delete 시각은 FE 계약에 맞춰 ISO 문자열로 변환합니다.
          ...(subcluster.deletedAt != null && {
            deletedAt: new Date(subcluster.deletedAt).toISOString(),
          }),
        };
      })
      .filter((subcluster): subcluster is GraphSubclusterDto => subcluster != null);
  }

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
  async prepareNodeAndVector(
    _node: Partial<GraphNodeDto>,
    _embedding?: number[],
    _meta?: Record<string, unknown>
  ) {
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
  async searchNodesByVector(
    _userId: string,
    _collection: string | undefined,
    _queryVector: number[],
    _limit = 10
  ) {
    this.throwVectorDisabledError();
  }

  /**
   * 벡터가 누락된 노드를 찾습니다. (현재 비활성화)
   * @deprecated 벡터 정합성 검증은 비활성화되었습니다.
   */
  async findNodesMissingVectors(_userId: string, _collection: string, _nodeIds: Array<number>) {
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
   * @param id - 갱신할 노드의 ID
   * @param patch - 갱신할 속성 객체
   * @returns Promise<void>
   * @throws {NotFoundError | UpstreamError} - 노드가 없거나 DB 오류 발생 시
   */
  updateNode(userId: string, id: number, patch: Partial<GraphNodeDto>) {
    return this.graphManagementService.updateNode(userId, id, patch);
  }

  /**
   * 특정 노드와 그 노드와 연결된 모든 엣지를 삭제합니다.
   *
   * 이 작업은 트랜잭션 내에서 실행되어 원자성을 보장합니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @param id - 삭제할 노드의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   * @see removeNodeCascade - 노드와 연결된 모든 엣지를 함께 삭제하려면 이 메서드를 사용하세요.
   */
  async deleteNode(userId: string, id: number, permanent?: boolean) {
    await this.runInTransaction('GraphEmbeddingService.deleteNode', (session) =>
      this.graphManagementService.deleteNode(userId, id, permanent, { session })
    );
  }

  /**
   * 노드 복구합니다.
   */
  async restoreNode(userId: string, id: number) {
    await this.runInTransaction('GraphEmbeddingService.restoreNode', (session) =>
      this.graphManagementService.restoreNode(userId, id, { session })
    );
  }

  /**
   * 특정 노드를 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param id - 조회할 노드의 ID
   * @returns 조회된 노드 객체. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  findNode(userId: string, id: number) {
    return this.graphManagementService.findNode(userId, id);
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
   * 특정 사용자의 모든 노드 목록(soft delete 되어서 휴지통에 잇는 것 까지)을 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 노드 객체 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  listNodesAll(userId: string) {
    return this.graphManagementService.listNodesAll(userId);
  }

  /**
   * 특정 클러스터에 속한 활성 노드 목록을 조회합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns 해당 클러스터의 활성 노드 DTO 배열
   */
  listNodesByCluster(userId: string, clusterId: string) {
    return this.graphManagementService.listNodesByCluster(userId, clusterId);
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
  deleteEdge(userId: string, edgeId: string, permanent?: boolean) {
    return this.graphManagementService.deleteEdge(userId, edgeId, permanent);
  }

  /**
   * 삭제된 엣지를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param edgeId 복구할 엣지 ID
   * @returns Promise<void>
   */
  restoreEdge(userId: string, edgeId: string) {
    return this.graphManagementService.restoreEdge(userId, edgeId);
  }

  /**
   * 두 노드 사이에 있는 모든 엣지를 삭제합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param source - 출발 노드 ID
   * @param target - 도착 노드 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  deleteEdgeBetween(userId: string, source: number, target: number, permanent?: boolean) {
    return this.graphManagementService.deleteEdgeBetween(userId, source, target, permanent);
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
    await this.runInTransaction('GraphEmbeddingService.upsertCluster', (session) =>
      this.graphManagementService.upsertCluster(cluster, { session })
    );
  }

  /**
   * 특정 클러스터를 삭제합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param id - 삭제할 클러스터의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 오류 발생 시
   * @see removeClusterCascade - 클러스터와 속한 모든 노드/엣지를 삭제하려면 이 메서드를 사용하세요.
   */
  async deleteCluster(userId: string, id: string, permanent?: boolean): Promise<void> {
    await this.runInTransaction('GraphEmbeddingService.deleteCluster', (session) =>
      this.graphManagementService.deleteCluster(userId, id, permanent, { session })
    );
  }

  /**
   * 클러스터 복구
   */
  /**
   * 삭제된 클러스터를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param id 복구할 클러스터 ID
   * @returns Promise<void>
   */
  async restoreCluster(userId: string, id: string): Promise<void> {
    await this.runInTransaction('GraphEmbeddingService.restoreCluster', (session) =>
      this.graphManagementService.restoreCluster(userId, id, { session })
    );
  }

  /**
   * 특정 클러스터를 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param id - 조회할 클러스터의 ID
   * @returns 조회된 클러스터 객체. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  findCluster(userId: string, id: string) {
    return this.graphManagementService.findCluster(userId, id);
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
   * @param id - 삭제할 노드의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 작업 중 오류 발생 시
   * @example
   * // 노드 5와 연결된 모든 엣지를 함께 삭제
   * await service.removeNodeCascade('u-123', 5);
   */
  async removeNodeCascade(userId: string, id: number, permanent?: boolean): Promise<void> {
    // GraphRepositoryMongo.deleteNode 에 이미 관련 엣지 삭제 로직이 포함되어 있음
    await this.graphManagementService.deleteNode(userId, id, permanent);
  }

  /**
   * 특정 클러스터와 그에 속한 모든 노드 및 관련 엣지를 삭제합니다. (Cascade)
   *
   * 이 작업은 여러 단계로 이루어지며, 부분적으로만 성공할 수 있는 위험이 있습니다.
   * 따라서 MongoDB 트랜잭션을 사용하여 원자적으로 처리됩니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @param id - 삭제할 클러스터의 ID
   * @returns Promise<void>
   * @throws {UpstreamError} - DB 작업 중 오류 발생 시
   */
  async removeClusterCascade(userId: string, id: string, permanent?: boolean): Promise<void> {
    await this.runInTransaction('GraphEmbeddingService.removeClusterCascade', async (session) => {
      const nodesInCluster = await this.graphManagementService.listNodesByCluster(userId, id);
      if (nodesInCluster.length > 0) {
        const nodeIds = nodesInCluster.map((n) => n.id);
        await this.graphManagementService.deleteEdgesByNodeIds(userId, nodeIds, permanent, {
          session,
        });
        await this.graphManagementService.deleteNodes(userId, nodeIds, permanent, { session });
      }
      await this.graphManagementService.deleteCluster(userId, id, permanent, { session });
    });
  }

  /**
   * 특정 사용자의 전체 그래프 데이터를 스냅샷 형태로 조회합니다.
   *
   * @param userId - 조회할 사용자 ID
   * @returns 그래프 스냅샷 DTO. 데이터가 없으면 각 배열은 비어있고, stats는 null일 수 있습니다.
   * @throws {UpstreamError} - DB 조회 중 오류 발생 시
   */
  async getSnapshotForUser(userId: string): Promise<GraphSnapshotDto> {
    const [nodeDocs, edges, clusters, subclusterDocs, stats, nodeCnt, edgeCnt, clusterCnt] =
      await Promise.all([
        this.graphManagementService.listNodeDocs(userId),
        this.graphManagementService.listEdges(userId),
        this.graphManagementService.listClusters(userId),
        this.graphManagementService.listSubclusters(userId),
        this.graphManagementService.getStats(userId),
        this.graphManagementService.countNodes(userId),
        this.graphManagementService.countEdges(userId),
        this.graphManagementService.countClusters(userId),
      ]);

    // clusterName join: clusterId는 userId 범위 안에서만 유니크하므로 반드시 userId 복합 조건 사용
    const nodes = nodeDocs.map((doc) => this.toSnapshotNode(doc));
    const clusterMap = new Map(clusters.map((c) => [c.id, c]));
    const clusterSizes = this.buildClusterNodeCounts(nodeDocs);
    const nodesWithClusterName = nodes.map((node) => ({
      ...node,
      clusterName: clusterMap.get(node.clusterId)?.name ?? '',
    }));

    const enrichedNodes = await this.attachNodeTitles(userId, nodesWithClusterName);
    const liveClusters = clusters.map((cluster) => ({
      ...cluster,
      size: clusterSizes.get(cluster.id) ?? 0,
    }));
    const liveSubclusters = this.buildSnapshotSubclusters(nodeDocs, subclusterDocs);

    return {
      nodes: enrichedNodes,
      edges,
      clusters: liveClusters,
      subclusters: liveSubclusters,
      // stats.nodes/edges/clusters는 비정규화 값이므로 실시간 count로 대체
      stats: stats
        ? { nodes: nodeCnt, edges: edgeCnt, clusters: clusterCnt, status: stats.status }
        : { nodes: 0, edges: 0, clusters: 0, status: 'NOT_CREATED' },
    };
  }

  /**
   * 그래프 노드에 제목을 추가합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @param nodes - 그래프 노드 배열
   * @returns 제목이 추가된 그래프 노드 배열
   */
  private async attachNodeTitles(userId: string, nodes: GraphNodeDto[]): Promise<GraphNodeDto[]> {
    const titleByOrigId = new Map<string, string>();

    // 채팅 노드의 원본 ID 추출
    const chatOrigIds = [
      ...new Set(
        nodes
          .filter((node) => node.sourceType === 'chat')
          .map((node) => node.origId)
          .filter((origId) => origId.trim().length > 0)
      ),
    ];

    // 마크다운 노드의 원본 ID 추출
    const markdownOrigIds = [
      ...new Set(
        nodes
          .filter((node) => node.sourceType === 'markdown')
          .map((node) => node.origId)
          .filter((origId) => origId.trim().length > 0)
      ),
    ];

    // 채팅 노드의 제목 추가
    if (chatOrigIds.length > 0 && this.conversationService) {
      // 채팅 노드의 원본 ID를 사용하여 대화 문서 조회
      const conversationDocs = await this.conversationService.findDocsByIds(chatOrigIds, userId);
      // 대화 문서의 제목을 제목 맵에 추가
      for (const conversationDoc of conversationDocs) {
        if (conversationDoc.title?.trim()) {
          titleByOrigId.set(conversationDoc._id, conversationDoc.title);
        }
      }
    }

    // 마크다운 노드의 제목 추가
    if (markdownOrigIds.length > 0 && this.noteService) {
      const noteService = this.noteService;

      // 마크다운 노드의 원본 ID를 사용하여 노트 문서 조회
      const noteDocs = await Promise.all(
        markdownOrigIds.map((origId) => noteService.getNoteDoc(origId, userId))
      );
      // 노트 문서의 제목을 제목 맵에 추가
      for (const noteDoc of noteDocs) {
        if (noteDoc?._id && noteDoc.title?.trim()) {
          titleByOrigId.set(noteDoc._id, noteDoc.title);
        }
      }
    }

    // 노드에 제목 추가
    return nodes.map((node) => {
      if (node.sourceType === 'chat' || node.sourceType === 'markdown') {
        const nodeTitle = titleByOrigId.get(node.origId);
        return nodeTitle ? { ...node, nodeTitle } : node;
      }

      // FIXME TODO: 추후에 Notion 추가 시에 변경 요망.
      return node;
    });
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
    await this.runInTransaction('GraphEmbeddingService.persistSnapshot', (session) =>
      this.graphManagementService.persistSnapshotBulk(payload, { session })
    );
  }

  /**
   * 유저의 모든 그래프 삭제 (Delegation)
   *
   * @param userId
   */
  async deleteGraph(userId: string, permanent?: boolean) {
    await this.runInTransaction('GraphEmbeddingService.deleteGraph', (session) =>
      this.graphManagementService.deleteGraph(userId, permanent, { session })
    );
  }

  /**
   * 전체 그래프 복구는 현재 hard-delete 정책 때문에 지원하지 않습니다.
   *
   * @param _userId 사용자 ID
   * @throws {UpstreamError} 항상 발생
   */
  async restoreGraph(_userId: string) {
    // [Hard Delete Policy] Restore is no longer supported
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  // --- Insight Summary ---

  /**
   * 그래프 요약/인사이트 저장 (Delegation)
   *
   * @param userId 사용자 Id
   * @param summary
   */
  async upsertGraphSummary(userId: string, summary: GraphSummaryDoc) {
    return this.graphManagementService.upsertGraphSummary(userId, summary);
  }

  /**
   * 그래프 요약/인사이트 조회 (Delegation)
   *
   * @param userId 사용자 Id
   */
  async getGraphSummary(userId: string) {
    const [summary, conversationCount, noteCount, totalNodes] = await Promise.all([
      this.graphManagementService.getGraphSummary(userId),
      this.conversationService?.countConversations(userId) ?? Promise.resolve(0),
      this.noteService?.countNotes(userId) ?? Promise.resolve(0),
      this.graphManagementService.countNodes(userId),
    ]);

    return {
      ...summary,
      overview: {
        ...summary.overview,
        total_source_nodes: totalNodes,       // 실시간 count — AI 생성 시점 값 덮어쓰기
        total_conversations: conversationCount,
        total_notes: noteCount,
      },
    };
  }

  /**
   * 그래프 요약/인사이트 삭제 (Delegation)
   *
   * @param userId 사용자 Id
   * @param permanent 영구 삭제 여부
   */
  async deleteGraphSummary(userId: string, permanent?: boolean) {
    return this.graphManagementService.deleteGraphSummary(userId, permanent);
  }

  /**
   * 그래프 요약/인사이트 복원 (Delegation)
   *
   * @param _userId 사용자 Id
   */
  async restoreGraphSummary(_userId: string) {
    // [Hard Delete Policy] Restore is no longer supported
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }
}
