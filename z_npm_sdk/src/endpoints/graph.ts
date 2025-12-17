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
 * 
 * 지식 그래프(Knowledge Graph)의 노드, 엣지, 클러스터를 관리하는 API 클래스입니다.
 * `/v1/graph` 엔드포인트 하위의 API들을 호출합니다.
 * 
 * 주요 기능:
 * - 노드 관리 (생성, 조회, 수정, 삭제) (`createNode`, `listNodes`, `getNode`, `updateNode`, `deleteNode`)
 * - 엣지 관리 (생성, 조회, 삭제) (`createEdge`, `listEdges`, `deleteEdge`)
 * - 클러스터 관리 (생성, 조회, 삭제) (`createCluster`, `listClusters`, `getCluster`, `deleteCluster`)
 * - 그래프 통계 및 스냅샷 (`getStats`, `getSnapshot`, `saveSnapshot`)
 * 
 * @public
 */
export class GraphApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/graph');
  }

  /**
   * 새 노트를 생성하거나 기존 노드를 업데이트합니다.
   * @param node - 생성 또는 업데이트할 노드 데이터
   *    - `id` (number): 노드 ID (정수)
   *    - `userId` (string): 사용자 ID
   *    - `origId` (string): 원본 데이터 ID (예: conversationId)
   *    - `clusterId` (string): 클러스터 ID
   *    - `clusterName` (string): 클러스터 이름
   *    - `timestamp` (string | null): 타임스탬프
   *    - `numMessages` (number): 메시지 수
   * @returns 생성 또는 업데이트된 노드 정보
   * @example
   * const response = await client.graph.createNode({
   *   id: 101,
   *   userId: 'user-123',
   *   origId: 'conv-uuid-1',
   *   clusterId: 'cluster-a',
   *   clusterName: 'Project Alpha',
   *   timestamp: new Date().toISOString(),
   *   numMessages: 5
   * });
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 101,
   *   userId: 'user-123',
   *   origId: 'conv-uuid-1',
   *   clusterId: 'cluster-a',
   *   clusterName: 'Project Alpha',
   *   timestamp: '...',
   *   numMessages: 5
   * }
   */
  createNode(node: GraphNodeDto): Promise<HttpResponse<GraphNodeDto>> {
    return this.rb.path('/nodes').post<GraphNodeDto>(node);
  }

  /**
   * 사용자의 모든 노드를 가져옵니다.
   * @returns 노드 목록 (GraphNodeDto 배열)
   * @example
   * const response = await client.graph.listNodes();
   * 
   * console.log(response.data);
   * // Output:
   * [
   *   {
   *     id: 101,
   *     userId: 'user-123',
   *     origId: 'conv-uuid-1',
   *     clusterId: 'cluster-a',
   *     clusterName: 'Project Alpha',
   *     timestamp: '...',
   *     numMessages: 5
   *   },
   *   {
   *     id: 102,
   *     userId: 'user-123',
   *     origId: 'conv-uuid-2',
   *     clusterId: 'cluster-b',
   *     clusterName: 'Project Beta',
   *     timestamp: '...',
   *     numMessages: 3
   *   }
   * ]
   */
  listNodes(): Promise<HttpResponse<GraphNodeDto[]>> {
    return this.rb.path('/nodes').get<GraphNodeDto[]>();
  }

  /**
   * 특정 ID의 노드를 가져옵니다.
   * @param nodeId - 가져올 노드의 ID (정수)
   * @returns 요청한 노드 상세 정보
   * @example
   * const response = await client.graph.getNode(101);
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 101,
   *   userId: 'user-123',
   *   origId: 'conv-uuid-1',
   *   clusterId: 'cluster-a',
   *   clusterName: 'Project Alpha',
   *   timestamp: '...',
   *   numMessages: 5
   * }
   */
  getNode(nodeId: number): Promise<HttpResponse<GraphNodeDto>> {
    return this.rb.path(`/nodes/${nodeId}`).get<GraphNodeDto>();
  }

  /**
   * 특정 노드를 부분적으로 업데이트합니다.
   * @param nodeId - 업데이트할 노드의 ID
   * @param payload - 업데이트할 데이터
   *    - `clusterId` (string, optional): 변경할 클러스터 ID
   *    - `clusterName` (string, optional): 변경할 클러스터 이름
   * @example
   * await client.graph.updateNode(101, {
   *   clusterName: 'Project Beta'
   * });
   * // Output: (No content)
   */
  updateNode(nodeId: number, payload: UpdateNodePayload): Promise<HttpResponse<void>> {
    return this.rb.path(`/nodes/${nodeId}`).patch<void>(payload);
  }

  /**
   * 특정 노드를 삭제합니다.
   * @param nodeId - 삭제할 노드의 ID
   * @example
   * await client.graph.deleteNode(101);
   * // Output: (No content)
   */
  deleteNode(nodeId: number): Promise<HttpResponse<void>> {
    return this.rb.path(`/nodes/${nodeId}`).delete<void>();
  }

  /**
   * 특정 노드와 연결된 모든 엣지를 함께 삭제합니다.
   * @param nodeId - 삭제할 노드의 ID
   * @example
   * await client.graph.deleteNodeCascade(101);
   * // Output: (No content)
   */
  deleteNodeCascade(nodeId: number): Promise<HttpResponse<void>> {
    return this.rb.path(`/nodes/${nodeId}/cascade`).delete<void>();
  }

  /**
   * 새 엣지를 생성합니다.
   * @param edge - 생성할 엣지 데이터
   *    - `source` (number): 출발 노드 ID
   *    - `target` (number): 도착 노드 ID
   *    - `weight` (number): 가중치
   *    - `type` ('hard' | 'insight'): 엣지 타입
   *    - `intraCluster` (boolean): 클러스터 내부 연결 여부
   * @returns 생성된 엣지 ID
   *    - `id` (string): 엣지 ID
   * @example
   * const response = await client.graph.createEdge({
   *   source: 101,
   *   target: 102,
   *   weight: 0.85,
   *   type: 'insight',
   *   intraCluster: true
   * });
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'edge-uuid-...'
   * }
   */
  createEdge(edge: GraphEdgeDto): Promise<HttpResponse<CreateEdgeResponse>> {
    return this.rb.path('/edges').post<CreateEdgeResponse>(edge);
  }

  /**
   * 사용자의 모든 엣지를 가져옵니다.
   * @returns 엣지 목록 (GraphEdgeDto 배열)
   * @example
   * const response = await client.graph.listEdges();
   * 
   * console.log(response.data);
   * // Output:
   * [
   *   {
   *     id: 'edge-1',
   *     source: 101,
   *     target: 102,
   *     weight: 0.85,
   *     type: 'insight',
   *     intraCluster: true
   *   },
   *   {
   *     id: 'edge-2',
   *     source: 102,
   *     target: 103,
   *     weight: 0.5,
   *     type: 'hard',
   *     intraCluster: false
   *   }
   * ]
   */
  listEdges(): Promise<HttpResponse<GraphEdgeDto[]>> {
    return this.rb.path('/edges').get<GraphEdgeDto[]>();
  }

  /**
   * 특정 엣지를 삭제합니다.
   * @param edgeId - 삭제할 엣지의 ID
   * @example
   * await client.graph.deleteEdge('edge-uuid-...');
   * // Output: (No content)
   */
  deleteEdge(edgeId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/edges/${edgeId}`).delete<void>();
  }

  /**
   * 새 클러스터를 생성하거나 기존 클러스터를 업데이트합니다.
   * @param cluster - 생성 또는 업데이트할 클러스터 데이터
   * @returns 생성 또는 업데이트된 클러스터
   * @example
   * const response = await client.graph.createCluster({
   *   id: 'cluster-a',
   *   name: 'Project Alpha',
   *   summary: 'Main project discussion'
   * });
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'cluster-a',
   *   name: 'Project Alpha',
   *   summary: 'Main project discussion'
   * }
   */
  createCluster(cluster: GraphClusterDto): Promise<HttpResponse<GraphClusterDto>> {
    return this.rb.path('/clusters').post<GraphClusterDto>(cluster);
  }

  /**
   * 사용자의 모든 클러스터를 가져옵니다.
   * @returns 클러스터 목록
   * @example
   * const response = await client.graph.listClusters();
   * 
   * console.log(response.data);
   * // Output:
   * [
   *   {
   *     id: 'cluster-a',
   *     name: 'Project Alpha',
   *     summary: 'Main project discussion'
   *   },
   *   {
   *     id: 'cluster-b',
   *     name: 'Project Beta',
   *     summary: 'Secondary project'
   *   }
   * ]
   */
  listClusters(): Promise<HttpResponse<GraphClusterDto[]>> {
    return this.rb.path('/clusters').get<GraphClusterDto[]>();
  }

  /**
   * 특정 ID의 클러스터를 가져옵니다.
   * @param clusterId - 가져올 클러스터의 ID
   * @returns 요청한 클러스터
   * @example
   * const response = await client.graph.getCluster('cluster-a');
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'cluster-a',
   *   name: 'Project Alpha',
   *   summary: 'Main project discussion'
   * }
   */
  getCluster(clusterId: string): Promise<HttpResponse<GraphClusterDto>> {
    return this.rb.path(`/clusters/${clusterId}`).get<GraphClusterDto>();
  }

  /**
   * 특정 클러스터를 삭제합니다.
   * @param clusterId - 삭제할 클러스터의 ID
   * @example
   * await client.graph.deleteCluster('cluster-a');
   * // Output: (No content)
   */
  deleteCluster(clusterId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/clusters/${clusterId}`).delete<void>();
  }

  /**
   * 특정 클러스터와 그 안의 모든 노드 및 엣지를 삭제합니다.
   * @param clusterId - 삭제할 클러스터의 ID
   * @example
   * await client.graph.deleteClusterCascade('cluster-a');
   * // Output: (No content)
   */
  deleteClusterCascade(clusterId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/clusters/${clusterId}/cascade`).delete<void>();
  }

  /**
   * 그래프 통계를 가져옵니다.
   * @returns 그래프 통계
   * @example
   * const response = await client.graph.getStats();
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   nodeCount: 100,
   *   edgeCount: 150,
   *   clusterCount: 5,
   *   density: 0.03
   * }
   */
  getStats(): Promise<HttpResponse<GraphStatsDto>> {
    return this.rb.path('/stats').get<GraphStatsDto>();
  }

  /**
   * 전체 그래프 스냅샷을 가져옵니다.
   * @returns 그래프 스냅샷
   * @example
   * const response = await client.graph.getSnapshot();
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   nodes: [
   *     { id: 101, ... },
   *     { id: 102, ... }
   *   ],
   *   edges: [
   *     { id: 'edge-1', ... }
   *   ],
   *   clusters: [
   *     { id: 'cluster-a', ... }
   *   ]
   * }
   */
  getSnapshot(): Promise<HttpResponse<GraphSnapshotDto>> {
    return this.rb.path('/snapshot').get<GraphSnapshotDto>();
  }

  /**
   * 전체 그래프 스냅샷을 서버에 저장합니다.
   * @param snapshot - 저장할 스냅샷 데이터
   * @example
   * await client.graph.saveSnapshot({
   *   nodes: [...],
   *   edges: [...],
   *   clusters: [...]
   * });
   * // Output: (No content)
   */
  saveSnapshot(snapshot: GraphSnapshotDto): Promise<HttpResponse<void>> {
    return this.rb.path('/snapshot').post<void>({ snapshot });
  }
}
