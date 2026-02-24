/**
 * 모듈: Graph Controller (그래프 컨트롤러)
 *
 * 책임:
 * - 그래프 데이터(노드, 엣지, 클러스터)와 관련된 HTTP 요청을 처리합니다.
 * - 클라이언트로부터 받은 데이터를 검증하고, GraphVectorService를 호출하여 비즈니스 로직을 수행합니다.
 * - 처리 결과를 적절한 HTTP 상태 코드와 함께 JSON 형태로 응답합니다.
 *
 * 외부 의존:
 * - express: Request, Response 객체 사용
 * - GraphVectorService: 그래프 및 벡터 관련 비즈니스 로직 수행
 * - DTO Schemas: 데이터 검증 (Zod)
 */

import { Request, Response } from 'express';

import { GraphEmbeddingService } from '../../core/services/GraphEmbeddingService';
import { persistGraphPayloadSchema } from '../../shared/dtos/graph.schemas';
import { getUserIdFromRequest } from '../utils/request';
import { GraphSnapshotDto } from '../../shared/dtos/graph';

export class GraphController {
  constructor(private readonly graphEmbeddingService: GraphEmbeddingService) {}

  // --- Node (노드) 관련 핸들러 ---

  /**
   * 노드 생성 또는 갱신 (Upsert)
   * [POST] /v1/graph/nodes
   *
   * 역할:
   * - 클라이언트로부터 노드 데이터를 받아 생성하거나, 이미 존재하면 갱신합니다.
   * - 멱등성(Idempotency)을 보장하는 Upsert 방식으로 동작합니다.
   */
  async createNode(req: Request, res: Response) {
    const node = req.body;
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (노드 저장)
    await this.graphEmbeddingService.upsertNode({ ...node, userId });

    res.status(201).json(node);
  }

  /**
   * 단일 노드 조회
   * [GET] /v1/graph/nodes/:id
   */
  async getNode(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = parseInt(req.params.id, 10);

    // 서비스 호출 (노드 조회)
    const node = await this.graphEmbeddingService.findNode(userId, id);

    res.status(200).json(node);
  }

  /**
   * 노드 목록 조회
   * [GET] /v1/graph/nodes
   * Query params:
   * - clusterId: 특정 클러스터만 조회
   * - includeEmbeddings: true이면 embedding 포함 (기본 false)
   *    - graph render시에는 embedding이 필요하지 않고
   *    - ai서버에서 add_node시에 필요해서 추가
   */
  async listNodes(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;

    const clusterId = typeof req.query.clusterId === 'string' ? req.query.clusterId : undefined;
    const includeEmbeddings = req.query.includeEmbeddings === 'true';

    const nodes = clusterId
      ? await this.graphEmbeddingService.listNodesByCluster(userId, clusterId)
      : await this.graphEmbeddingService.listNodes(userId);

    // includeEmbeddings가 false면 embedding 필드 제거
    if (!includeEmbeddings) {
      const nodesWithoutEmbedding = nodes.map(node => {
        const { embedding, ...rest } = node;
        return rest;
      });
      res.status(200).json(nodesWithoutEmbedding);
    } else {
      res.status(200).json(nodes);
    }
  }

  /**
   * 노드 부분 수정 (Patch)
   * [PATCH] /v1/graph/nodes/:id
   */
  async updateNode(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = parseInt(req.params.id, 10);
    const patch = req.body;

    // 서비스 호출 (노드 수정)
    await this.graphEmbeddingService.updateNode(userId, id, patch);

    res.status(204).send();
  }

  /**
   * 노드 삭제
   * [DELETE] /v1/graph/nodes/:id
   *
   * 주의: 이 API는 노드만 삭제하며, 연결된 엣지는 남을 수 있습니다.
   */
  async deleteNode(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = parseInt(req.params.id, 10);

    // 서비스 호출 (노드 삭제)
    await this.graphEmbeddingService.deleteNode(userId, id);

    res.status(204).send();
  }

  /**
   * 노드 및 관련 데이터 연쇄 삭제 (Cascade)
   * [DELETE] /v1/graph/nodes/:id/cascade
   *
   * 역할:
   * - 해당 노드와 연결된 모든 엣지를 함께 삭제합니다.
   */
  async deleteNodeCascade(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = parseInt(req.params.id, 10);

    // 서비스 호출 (Cascade 삭제)
    await this.graphEmbeddingService.removeNodeCascade(userId, id);

    res.status(204).send();
  }

  // --- Edge (엣지/관계) 관련 핸들러 ---

  /**
   * 엣지 생성 또는 갱신
   * [POST] /v1/graph/edges
   */
  async createEdge(req: Request, res: Response) {
    const edge = req.body;
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (엣지 저장)
    const edgeId = await this.graphEmbeddingService.upsertEdge({ ...edge, userId });

    res.status(201).json({ id: edgeId });
  }

  /**
   * 엣지 목록 조회
   * [GET] /v1/graph/edges
   */
  async listEdges(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (전체 엣지 목록)
    const edges = await this.graphEmbeddingService.listEdges(userId);

    res.status(200).json(edges);
  }

  /**
   * 엣지 삭제
   * [DELETE] /v1/graph/edges/:edgeId
   */
  async deleteEdge(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const edgeId = req.params.edgeId;

    // 서비스 호출 (엣지 삭제)
    await this.graphEmbeddingService.deleteEdge(userId, edgeId);

    res.status(204).send();
  }

  // --- Cluster (클러스터/그룹) 관련 핸들러 ---

  /**
   * 클러스터 생성 또는 갱신
   * [POST] /v1/graph/clusters
   */
  async createCluster(req: Request, res: Response) {
    const cluster = req.body;
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (클러스터 저장)
    await this.graphEmbeddingService.upsertCluster({ ...cluster, userId });

    res.status(201).json(cluster);
  }

  /**
   * 단일 클러스터 조회
   * [GET] /v1/graph/clusters/:id
   */
  async getCluster(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = req.params.id;

    // 서비스 호출 (클러스터 조회)
    const cluster = await this.graphEmbeddingService.findCluster(userId, id);

    res.status(200).json(cluster);
  }

  /**
   * 클러스터 목록 조회
   * [GET] /v1/graph/clusters
   */
  async listClusters(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (전체 클러스터 목록)
    const clusters = await this.graphEmbeddingService.listClusters(userId);

    res.status(200).json(clusters);
  }

  /**
   * 클러스터 삭제
   * [DELETE] /v1/graph/clusters/:id
   *
   * 주의: 클러스터만 삭제되며, 내부에 속한 노드들은 삭제되지 않습니다.
   */
  async deleteCluster(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = req.params.id;

    // 서비스 호출 (클러스터 삭제)
    await this.graphEmbeddingService.deleteCluster(userId, id);

    res.status(204).send();
  }

  /**
   * 클러스터 및 내부 요소 연쇄 삭제 (Cascade)
   * [DELETE] /v1/graph/clusters/:id/cascade
   *
   * 역할:
   * - 클러스터와 그 안에 속한 모든 노드, 그리고 그 노드들에 연결된 엣지까지 모두 삭제합니다.
   * - 매우 파괴적인 작업이므로 주의해서 사용해야 합니다.
   */
  async deleteClusterCascade(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const id = req.params.id;

    // 서비스 호출 (Cascade 삭제)
    await this.graphEmbeddingService.removeClusterCascade(userId, id);

    res.status(204).send();
  }

  // --- Stats (통계) 관련 핸들러 ---

  /**
   * 그래프 통계 조회
   * [GET] /v1/graph/stats
   */
  async getStats(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (통계 조회)
    const stats = await this.graphEmbeddingService.getStats(userId);

    res.status(200).json(stats);
  }

  // --- Snapshot (전체 데이터) 관련 핸들러 ---

  /**
   * 그래프 전체 스냅샷 조회
   * [GET] /v1/graph/snapshot
   *
   * 역할:
   * - 사용자의 모든 그래프 데이터(노드, 엣지, 클러스터, 통계)를 한 번에 조회합니다.
   * - 클라이언트 초기 로딩 시 주로 사용됩니다.
   */
  async getSnapshot(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;

    // 서비스 호출 (스냅샷 조회)
    const snapshot : GraphSnapshotDto = await this.graphEmbeddingService.getSnapshotForUser(userId);

    res.status(200).json(snapshot);
  }

  /**
   * 그래프 전체 스냅샷 저장
   * [POST] /v1/graph/snapshot
   *
   * 역할:
   * - 클라이언트의 전체 그래프 상태를 서버에 덮어씌웁니다.
   * - 대량의 데이터를 트랜잭션으로 안전하게 저장합니다.
   */
  async saveSnapshot(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;

    // 1. 요청 데이터 검증 (Zod)
    const payloadToValidate = {
      userId,
      snapshot: req.body.snapshot,
    };
    const { snapshot } = persistGraphPayloadSchema.parse(payloadToValidate);

    // 2. 서비스 호출 (스냅샷 저장)
    await this.graphEmbeddingService.persistSnapshot({ userId, snapshot });

    res.status(204).send();
  }
}
