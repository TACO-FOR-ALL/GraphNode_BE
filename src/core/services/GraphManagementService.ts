import type { GraphDocumentStore, RepoOptions } from '../ports/GraphDocumentStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';
import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  PersistGraphPayloadDto,
  GraphStatsDto,
  GraphSummaryDto,
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
import {
  toGraphSummaryDto,
  createEmptyGraphSummaryDto,
} from '../../shared/mappers/graph_summary.mapper';

import {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../types/persistence/graph.persistence';

/**
 * 모듈: GraphManagementService (그래프 서비스)
 *
 * 책임:
 * - 그래프 데이터(노드, 엣지, 클러스터)의 비즈니스 로직을 처리합니다.
 * - DTO(Data Transfer Object)를 사용하여 데이터를 주고받습니다.
 * - GraphStore(Port)를 통해 DB 작업을 수행하며, 이 과정에서 Mapper를 사용해 DTO <-> Doc 변환을 수행합니다.
 */
export class GraphManagementService {
  constructor(private readonly repo: GraphDocumentStore) {}

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
      this.parseId(node.id); // Validate ID format

      // DTO -> Doc 변환 후 저장
      const doc: GraphNodeDoc = toGraphNodeDoc(node);
      await this.repo.upsertNode(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertNode failed', { cause: String(err) });
    }
  }

  /**
   * 여러 그래프 노드를 일괄 upsert 합니다.
   *
   * @param nodes 저장할 노드 DTO 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @throws {ValidationError} 사용자 ID 또는 노드 ID 형식이 유효하지 않은 경우
   * @throws {UpstreamError} 저장소 일괄 저장 중 오류가 발생한 경우
   * @remarks
   * - 각 노드는 저장 전에 DTO -> Doc 변환을 수행합니다.
   * - 입력 배열이 비어 있으면 no-op으로 처리합니다.
   */
  async upsertNodes(nodes: GraphNodeDto[], options?: RepoOptions): Promise<void> {
    try {
      if (nodes.length === 0) return;

      const docs: GraphNodeDoc[] = nodes.map((node) => {
        this.assertUser(node.userId);
        this.parseId(node.id);
        return toGraphNodeDoc(node);
      });

      await this.repo.upsertNodes(docs, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertNodes failed', { cause: String(err) });
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
  async updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDto>,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const nId = this.parseId(id);

      // updatedAt은 repository layer가 항상 갱신합니다. 외부에서 전달된 값은 무시됩니다.
      await this.repo.updateNode(userId, nId, patch as Partial<GraphNodeDoc>, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * 노드 삭제
   *
   * @param userId 사용자 ID
   * @param id 노드 ID
   */
  async deleteNode(
    userId: string,
    id: number,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const nId = this.parseId(id);
      await this.repo.deleteNode(userId, nId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteNode failed', { cause: String(err) });
    }
  }

  /**
   * 삭제된 노드를 복구합니다. (Soft Delete 해제)
   *
   * @param userId 사용자 ID
   * @param id 노드 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreNode(userId: string, id: number, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      const nId = this.parseId(id);
      await this.repo.restoreNode(userId, nId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreNode failed', { cause: String(err) });
    }
  }

  /**
   * 여러 노드 일괄 삭제
   *
   * @param userId 사용자 ID
   * @param ids 삭제할 노드 ID 배열
   */
  async deleteNodes(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const nIds = ids.map((id) => this.parseId(id));
      await this.repo.deleteNodes(userId, nIds, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteNodes failed', { cause: String(err) });
    }
  }

  /**
   * 원본 ID(origId) 배열 기반 연쇄 삭제
   *
   * @param userId 사용자 ID
   * @param origIds 메시지 ID 등의 원본 식별자 배열
   * @param permanent 완전 삭제 여부
   * @param options 트랜잭션 옵션
   */
  async deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteNodesByOrigIds(userId, origIds, permanent, options);

      //클러스터 

      //서브 클러스터 관련코드

    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteNodesByOrigIds failed', { cause: String(err) });
    }
  }

  /**
   * 원본 ID 배열 기반 연쇄 복원
   *
   * @param userId 사용자 ID
   * @param origIds 메시지 ID 등의 원본 식별자 배열
   * @param options 트랜잭션 옵션
   */
  async restoreNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.restoreNodesByOrigIds(userId, origIds, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreNodesByOrigIds failed', { cause: String(err) });
    }
  }

  /**
   * 노드 단건 조회
   *
   * @param userId 사용자 ID
   * @param id 노드 ID
   * @returns GraphNodeDto 또는 null
   */
  async findNode(userId: string, id: number): Promise<GraphNodeDto | null> {
    try {
      this.assertUser(userId);
      const nId = this.parseId(id);
      const doc: GraphNodeDoc | null = await this.repo.findNode(userId, nId);
      return doc ? toGraphNodeDto(doc) : null;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findNode failed', { cause: String(err) });
    }
  }

  /**
   * 원본 ID 목록 기반 여러 노드 조회
   *
   * @param userId 사용자 ID
   * @param origIds 원본 식별자 배열
   * @returns GraphNodeDto 배열
   */
  async findNodesByOrigIds(userId: string, origIds: string[]): Promise<GraphNodeDto[]> {
    try {
      this.assertUser(userId);
      const docs = await this.repo.findNodesByOrigIds(userId, origIds);
      return docs.map((doc) => toGraphNodeDto(doc));
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findNodesByOrigIds failed', { cause: String(err) });
    }
  }

  /**
   * 원본 ID 목록 기반 여러 노드 조회 (Soft Delete 포함)
   *
   * @param userId 사용자 ID
   * @param origIds 원본 식별자 배열
   * @returns GraphNodeDto 배열
   */
  async findNodesByOrigIdsAll(userId: string, origIds: string[]): Promise<GraphNodeDto[]> {
    try {
      this.assertUser(userId);
      const docs = await this.repo.findNodesByOrigIdsAll(userId, origIds);
      return docs.map((doc) => toGraphNodeDto(doc));
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.findNodesByOrigIdsAll failed', { cause: String(err) });
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
      const docs: GraphNodeDoc[] = await this.repo.listNodes(userId);
      return docs.map(toGraphNodeDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listNodes failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 모든 노드 목록(soft delete 되어서 휴지통에 잇는 것 까지)을 조회합니다.
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 노드 객체 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  async listNodesAll(userId: string): Promise<GraphNodeDto[]> {
    try {
      this.assertUser(userId);
      const docs: GraphNodeDoc[] = await this.repo.listNodesAll(userId);
      return docs.map(toGraphNodeDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listNodesAll failed', { cause: String(err) });
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
      const docs: GraphNodeDoc[] = await this.repo.listNodesByCluster(userId, clusterId);
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
      // Validated in toGraphEdgeDoc
      if (!['hard', 'insight'].includes(edge.type))
        throw new ValidationError('edge.type must be hard or insight');

      const doc: GraphEdgeDoc = toGraphEdgeDoc(edge);
      return await this.repo.upsertEdge(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertEdge failed', { cause: String(err) });
    }
  }

  /**
   * 여러 그래프 엣지를 일괄 upsert 합니다.
   *
   * @param edges 저장할 엣지 DTO 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @throws {ValidationError} 사용자 ID, 엣지 타입, source/target 형식이 유효하지 않은 경우
   * @throws {UpstreamError} 저장소 일괄 저장 중 오류가 발생한 경우
   * @remarks
   * - 각 엣지는 저장 전에 DTO -> Doc 변환을 수행합니다.
   * - 입력 배열이 비어 있으면 no-op으로 처리합니다.
   */
  async upsertEdges(edges: GraphEdgeDto[], options?: RepoOptions): Promise<void> {
    try {
      if (edges.length === 0) return;

      const docs: GraphEdgeDoc[] = edges.map((edge) => {
        this.assertUser(edge.userId);
        if (!['hard', 'insight'].includes(edge.type)) {
          throw new ValidationError('edge.type must be hard or insight');
        }
        return toGraphEdgeDoc(edge);
      });

      await this.repo.upsertEdges(docs, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertEdges failed', { cause: String(err) });
    }
  }

  /**
   * 엣지 삭제
   *
   * @param userId 사용자 ID
   * @param edgeId 엣지 ID
   * @param permanent 완전 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  async deleteEdge(
    userId: string,
    edgeId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!edgeId) throw new ValidationError('edgeId required');
      await this.repo.deleteEdge(userId, edgeId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteEdge failed', { cause: String(err) });
    }
  }

  /**
   * 엣지 복구
   *
   * @param userId 사용자 ID
   * @param edgeId 엣지 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      if (!edgeId) throw new ValidationError('edgeId required');
      await this.repo.restoreEdge(userId, edgeId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreEdge failed', { cause: String(err) });
    }
  }

  /**
   * 두 노드 사이의 엣지 삭제
   *
   * @param userId 사용자 ID
   * @param source 출발 노드 ID
   * @param target 도착 노드 ID
   */
  async deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const sId = this.parseId(source);
      const tId = this.parseId(target);
      await this.repo.deleteEdgeBetween(userId, sId, tId, permanent, options);
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
  async deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const nIds = ids.map((id) => this.parseId(id));
      await this.repo.deleteEdgesByNodeIds(userId, nIds, permanent, options);
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
      const docs: GraphEdgeDoc[] = await this.repo.listEdges(userId);
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
      const doc: GraphClusterDoc = toGraphClusterDoc(cluster);
      await this.repo.upsertCluster(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertCluster failed', { cause: String(err) });
    }
  }

  /**
   * 여러 그래프 클러스터를 일괄 upsert 합니다.
   *
   * @param clusters 저장할 클러스터 DTO 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @throws {ValidationError} 사용자 ID 또는 클러스터 ID가 유효하지 않은 경우
   * @throws {UpstreamError} 저장소 일괄 저장 중 오류가 발생한 경우
   * @remarks
   * - 각 클러스터는 저장 전에 DTO -> Doc 변환을 수행합니다.
   * - 입력 배열이 비어 있으면 no-op으로 처리합니다.
   */
  async upsertClusters(clusters: GraphClusterDto[], options?: RepoOptions): Promise<void> {
    try {
      if (clusters.length === 0) return;

      const docs: GraphClusterDoc[] = clusters.map((cluster) => {
        this.assertUser(cluster.userId);
        if (!cluster.id) throw new ValidationError('cluster.id required');
        return toGraphClusterDoc(cluster);
      });

      await this.repo.upsertClusters(docs, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertClusters failed', { cause: String(err) });
    }
  }

  /**
   * 클러스터 삭제
   *
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   */
  async deleteCluster(
    userId: string,
    clusterId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');
      await this.repo.deleteCluster(userId, clusterId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteCluster failed', { cause: String(err) });
    }
  }

  /**
   * 삭제된 클러스터를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');
      await this.repo.restoreCluster(userId, clusterId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreCluster failed', { cause: String(err) });
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
      const doc: GraphClusterDoc | null = await this.repo.findCluster(userId, clusterId);
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
      const docs: GraphClusterDoc[] = await this.repo.listClusters(userId);
      return docs.map(toGraphClusterDto);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listClusters failed', { cause: String(err) });
    }
  }

  // --- Subclusters ---

  /**
   * 서브클러스터 생성 또는 업데이트
   *
   * @param subcluster 서브클러스터 데이터 (Doc 형태)
   * @param options (선택) 트랜잭션 옵션
   */
  async upsertSubcluster(subcluster: GraphSubclusterDoc, options?: RepoOptions): Promise<void> {
    try {
      await this.repo.upsertSubcluster(subcluster, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertSubcluster failed', { cause: String(err) });
    }
  }

  /**
   * 여러 그래프 서브클러스터를 일괄 upsert 합니다.
   *
   * @param subclusters 저장할 서브클러스터 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @throws {UpstreamError} 저장소 일괄 저장 중 오류가 발생한 경우
   * @remarks
   * - 서브클러스터는 현재 DTO 계층이 아닌 persistence 문서 형태를 그대로 사용합니다.
   * - 입력 배열이 비어 있으면 no-op으로 처리합니다.
   */
  async upsertSubclusters(subclusters: GraphSubclusterDoc[], options?: RepoOptions): Promise<void> {
    try {
      if (subclusters.length === 0) return;
      await this.repo.upsertSubclusters(subclusters, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertSubclusters failed', { cause: String(err) });
    }
  }

  /**
   * 서브클러스터를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 서브클러스터 ID
   * @param permanent 영구 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  async deleteSubcluster(
    userId: string,
    subclusterId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteSubcluster(userId, subclusterId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteSubcluster failed', { cause: String(err) });
    }
  }

  /**
   * 삭제된 서브클러스터를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 서브클러스터 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreSubcluster(
    userId: string,
    subclusterId: string,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.restoreSubcluster(userId, subclusterId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreSubcluster failed', { cause: String(err) });
    }
  }

  /**
   * 사용자의 모든 서브클러스터 목록을 조회합니다.
   *
   * @param userId 사용자 ID
   * @returns 서브클러스터 문서 배열
   */
  async listSubclusters(userId: string): Promise<GraphSubclusterDoc[]> {
    try {
      this.assertUser(userId);
      const [subclusters, activeNodes] = await Promise.all([
        this.repo.listSubclusters(userId),
        this.repo.listNodes(userId),
      ]);
      const activeNodeIds = new Set(activeNodes.map((node) => node.id));

      return subclusters
        .map((subcluster) => {
          const nodeIds = subcluster.nodeIds.filter((nodeId) => activeNodeIds.has(nodeId));
          return {
            ...subcluster,
            nodeIds,
            size: nodeIds.length,
            representativeNodeId: nodeIds.includes(subcluster.representativeNodeId)
              ? subcluster.representativeNodeId
              : nodeIds[0] ?? subcluster.representativeNodeId,
          };
        })
        .filter((subcluster) => subcluster.size > 0);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.listSubclusters failed', { cause: String(err) });
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
      const doc: GraphStatsDoc = toGraphStatsDoc(stats);
      await this.repo.saveStats(doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.saveStats failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 스냅샷 전체를 bulkWrite 기반으로 일괄 반영합니다.
   *
   * @param payload 사용자 ID와 스냅샷 DTO를 포함한 저장 페이로드
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @throws {ValidationError} 사용자 ID, 노드 ID, 엣지 타입, 클러스터 ID가 유효하지 않은 경우
   * @throws {UpstreamError} 저장소 일괄 저장 중 오류가 발생한 경우
   * @remarks
   * - 노드, 엣지, 클러스터, 서브클러스터를 컬렉션별 bulkWrite로 순차 반영합니다.
   * - 동일 트랜잭션 안에서는 컬렉션 간 순서를 유지하여 세션 안정성을 높입니다.
   * - 통계 문서는 마지막 단계에서 upsert 하여 스냅샷 반영 완료 시점을 명확히 합니다.
   */
  async persistSnapshotBulk(payload: PersistGraphPayloadDto, options?: RepoOptions): Promise<void> {
    try {
      const { userId, snapshot } = payload;
      this.assertUser(userId);

      // SnapshotDto에서, Node/Edge/Cluster/SubCluster 분리
      const nodes: GraphNodeDto[] = snapshot.nodes.map((node) => ({ ...node, userId }));
      const edges: GraphEdgeDto[] = snapshot.edges.map((edge) => ({ ...edge, userId }));
      const clusters: GraphClusterDto[] = snapshot.clusters.map((cluster) => ({
        ...cluster,
        userId,
      }));
      const subclusters: GraphSubclusterDoc[] = (snapshot.subclusters || []).map((subcluster) => {
        const { deletedAt, ...rest } = subcluster;
        return {
          ...rest,
          userId,
          createdAt: '',
          updatedAt: '',
          ...(deletedAt != null ? { deletedAt: new Date(deletedAt).getTime() } : {}),
        };
      });

      // bulkWrite로 일괄 저장
      await this.upsertNodes(nodes, options);
      await this.upsertEdges(edges, options);
      await this.upsertClusters(clusters, options);
      await this.upsertSubclusters(subclusters, options);
      await this.saveStats({ ...snapshot.stats, userId }, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.persistSnapshotBulk failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 통계 조회
   *
   * @param userId 사용자 ID
   * @returns GraphStatsDto 또는 null
   */
  async getStats(userId: string): Promise<GraphStatsDto> {
    try {
      this.assertUser(userId);
      const doc: GraphStatsDoc | null = await this.repo.getStats(userId);
      return doc
        ? toGraphStatsDto(doc)
        : {
            userId,
            nodes: 0,
            edges: 0,
            clusters: 0,
            status: 'NOT_CREATED',
          };
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
  async deleteStats(userId: string, permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteStats(userId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteStats failed', { cause: String(err) });
    }
  }

  /**
   * 전체 그래프 데이터 삭제
   *
   * @param userId 사용자 ID
   */
  async deleteGraph(userId: string, permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteAllGraphData(userId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteGraph failed', { cause: String(err) });
    }
  }

  /**
   * 삭제된 모든 그래프 데이터를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreGraph(userId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.restoreAllGraphData(userId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreGraph failed', { cause: String(err) });
    }
  }

  // --- Insight Summary ---

  /**
   * 그래프 요약/인사이트 저장
   */
  async upsertGraphSummary(
    userId: string,
    summary: GraphSummaryDoc,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const doc: GraphSummaryDoc = { ...summary, userId };
      await this.repo.upsertGraphSummary(userId, doc, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.upsertGraphSummary failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 요약/인사이트 조회
   *
   * @param userId 사용자 ID
   * @returns GraphSummaryDto (FE SDK 호환 형식). Summary가 없으면 빈 기본값 반환.
   * @throws {ValidationError} userId 미제공 시
   * @throws {UpstreamError} DB 조회 실패 시
   * @remarks
   * - DB 저장 필드(total_source_nodes, generatedAt)를 FE 기대 필드(total_conversations, generated_at)로 변환
   * - 변환 로직은 `graph_summary.mapper.ts`의 `toGraphSummaryDto`에 위임
   */
  async getGraphSummary(userId: string): Promise<GraphSummaryDto> {
    try {
      this.assertUser(userId);
      const doc: GraphSummaryDoc | null = await this.repo.getGraphSummary(userId);
      if (!doc) {
        return createEmptyGraphSummaryDto();
      }

      return toGraphSummaryDto(doc);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.getGraphSummary failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 요약/인사이트 삭제
   */
  async deleteGraphSummary(
    userId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.deleteGraphSummary(userId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteGraphSummary failed', { cause: String(err) });
    }
  }

  /**
   * 삭제된 그래프 요약/인사이트를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreGraphSummary(userId: string, options?: RepoOptions): Promise<void> {
    try {
      this.assertUser(userId);
      await this.repo.restoreGraphSummary(userId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.restoreGraphSummary failed', { cause: String(err) });
    }
  }

  // --- 내부 헬퍼 메서드 ---

  private assertUser(userId: string | undefined): asserts userId is string {
    if (!userId) throw new ValidationError('userId required');
  }

  private parseId(id: number | string): number {
    const parsedId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(parsedId)) throw new ValidationError(`Invalid id: ${id}`);
    return parsedId;
  }
}
