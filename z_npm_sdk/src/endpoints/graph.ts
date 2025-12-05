import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  GraphNodeDto,
  GraphEdgeDto,
  GraphClusterDto,
  GraphStatsDto,
  GraphSnapshotDto,
  CreateEdgeResponse,
  UpdateNodePayload,
} from '../types/graph.js';

/**
 * Graph API
 * - 서버의 /v1/graph 경로의 API들을 호출합니다.
 */
export class GraphApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/graph');
  }

  /**
   * 새 노드를 생성하거나 기존 노드를 업데이트합니다.
   * @param node - 생성 또는 업데이트할 노드 데이터
   * @returns 생성 또는 업데이트된 노드
   */
  createNode(node: GraphNodeDto): Promise<HttpResponse<GraphNodeDto>> {
    return this.rb.path('/nodes').post<GraphNodeDto>(node);
  }

  /**
   * 사용자의 모든 노드를 가져옵니다.
   * @returns 노드 목록
   */
  listNodes(): Promise<HttpResponse<GraphNodeDto[]>> {
    return this.rb.path('/nodes').get<GraphNodeDto[]>();
  }

  /**
   * 특정 ID의 노드를 가져옵니다.
   * @param nodeId - 가져올 노드의 ID
   * @returns 요청한 노드
   */
  getNode(nodeId: number): Promise<HttpResponse<GraphNodeDto>> {
    return this.rb.path(`/nodes/${nodeId}`).get<GraphNodeDto>();
  }

  /**
   * 특정 노드를 부분적으로 업데이트합니다.
   * @param nodeId - 업데이트할 노드의 ID
   * @param payload - 업데이트할 데이터
   */
  updateNode(nodeId: number, payload: UpdateNodePayload): Promise<HttpResponse<void>> {
    return this.rb.path(`/nodes/${nodeId}`).patch<void>(payload);
  }

  /**
   * 특정 노드를 삭제합니다.
   * @param nodeId - 삭제할 노드의 ID
   */
  deleteNode(nodeId: number): Promise<HttpResponse<void>> {
    return this.rb.path(`/nodes/${nodeId}`).delete<void>();
  }

  /**
   * 특정 노드와 연결된 모든 엣지를 함께 삭제합니다.
   * @param nodeId - 삭제할 노드의 ID
   */
  deleteNodeCascade(nodeId: number): Promise<HttpResponse<void>> {
    return this.rb.path(`/nodes/${nodeId}/cascade`).delete<void>();
  }

  /**
   * 새 엣지를 생성합니다.
   * @param edge - 생성할 엣지 데이터
   * @returns 생성된 엣지의 ID
   */
  createEdge(edge: GraphEdgeDto): Promise<HttpResponse<CreateEdgeResponse>> {
    return this.rb.path('/edges').post<CreateEdgeResponse>(edge);
  }

  /**
   * 사용자의 모든 엣지를 가져옵니다.
   * @returns 엣지 목록
   */
  listEdges(): Promise<HttpResponse<GraphEdgeDto[]>> {
    return this.rb.path('/edges').get<GraphEdgeDto[]>();
  }

  /**
   * 특정 엣지를 삭제합니다.
   * @param edgeId - 삭제할 엣지의 ID
   */
  deleteEdge(edgeId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/edges/${edgeId}`).delete<void>();
  }

  /**
   * 새 클러스터를 생성하거나 기존 클러스터를 업데이트합니다.
   * @param cluster - 생성 또는 업데이트할 클러스터 데이터
   * @returns 생성 또는 업데이트된 클러스터
   */
  createCluster(cluster: GraphClusterDto): Promise<HttpResponse<GraphClusterDto>> {
    return this.rb.path('/clusters').post<GraphClusterDto>(cluster);
  }

  /**
   * 사용자의 모든 클러스터를 가져옵니다.
   * @returns 클러스터 목록
   */
  listClusters(): Promise<HttpResponse<GraphClusterDto[]>> {
    return this.rb.path('/clusters').get<GraphClusterDto[]>();
  }

  /**
   * 특정 ID의 클러스터를 가져옵니다.
   * @param clusterId - 가져올 클러스터의 ID
   * @returns 요청한 클러스터
   */
  getCluster(clusterId: string): Promise<HttpResponse<GraphClusterDto>> {
    return this.rb.path(`/clusters/${clusterId}`).get<GraphClusterDto>();
  }

  /**
   * 특정 클러스터를 삭제합니다.
   * @param clusterId - 삭제할 클러스터의 ID
   */
  deleteCluster(clusterId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/clusters/${clusterId}`).delete<void>();
  }

  /**
   * 특정 클러스터와 그 안의 모든 노드 및 엣지를 삭제합니다.
   * @param clusterId - 삭제할 클러스터의 ID
   */
  deleteClusterCascade(clusterId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/clusters/${clusterId}/cascade`).delete<void>();
  }

  /**
   * 그래프 통계를 가져옵니다.
   * @returns 그래프 통계
   */
  getStats(): Promise<HttpResponse<GraphStatsDto>> {
    return this.rb.path('/stats').get<GraphStatsDto>();
  }

  /**
   * 전체 그래프 스냅샷을 가져옵니다.
   * @returns 그래프 스냅샷
   */
  getSnapshot(): Promise<HttpResponse<GraphSnapshotDto>> {
    return this.rb.path('/snapshot').get<GraphSnapshotDto>();
  }

  /**
   * 전체 그래프 스냅샷을 서버에 저장합니다.
   * @param snapshot - 저장할 스냅샷 데이터
   */
  saveSnapshot(snapshot: GraphSnapshotDto): Promise<HttpResponse<void>> {
    return this.rb.path('/snapshot').post<void>({ snapshot });
  }
}
