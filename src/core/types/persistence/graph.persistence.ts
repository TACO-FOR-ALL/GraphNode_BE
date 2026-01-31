/**
 * Graph Node Document (MongoDB)
 * Collection: graph_nodes
 * @property id 노드 ID (number)
 * @property userId 사용자 ID
 * @property origId 원본 ID
 * @property clusterId 소속 클러스터 ID
 * @property clusterName 소속 클러스터 이름
 * @property timestamp 타임스탬프
 * @property numMessages 포함된 메시지 수
 * @property createdAt 생성 일시
 * @property updatedAt 수정 일시
 */
export interface GraphNodeDoc {
  id: number;
  userId: string;
  origId: string;
  clusterId: string;
  clusterName: string;
  timestamp: string | null;
  numMessages: number;
  embedding?: number[]; // 384-dimensional vector from AI pipeline
  createdAt: string;
  updatedAt: string;
}

/**
 * Graph Edge Document (MongoDB)
 * Collection: graph_edges
 * @property id 엣지 ID (사용자별 고유 문자열 또는 조합 키)
 * @property userId 사용자 ID
 * @property source 출발 노드 ID (number)
 * @property target 도착 노드 ID (number)
 * @property weight 엣지 가중치
 * @property type 엣지 유형 ('hard' | 'insight')
 * @property intraCluster 클러스터 내 엣지 여부
 * @property createdAt 생성 일시
 * @property updatedAt 수정 일시
 */
export interface GraphEdgeDoc {
  id: string;
  userId: string;
  source: number;
  target: number;
  weight: number;
  type: 'hard' | 'insight';
  intraCluster: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Graph Cluster Document (MongoDB)
 * Collection: graph_clusters
 * @property id 클러스터 ID
 * @property userId 사용자 ID
 * @property name 클러스터 이름
 * @property description 클러스터 설명
 * @property size 클러스터 크기 (노드 수)
 * @property themes 클러스터 테마 목록
 * @property createdAt 생성 일시
 * @property updatedAt 수정 일시
 */
export interface GraphClusterDoc {
  id: string;
  userId: string;
  name: string;
  description: string;
  size: number;
  themes: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Graph Stats Document (MongoDB)
 * Collection: graph_stats
 * @property id Key: userId
 * @property userId 사용자 ID
 * @property nodes 노드 수
 * @property edges 엣지 수
 * @property clusters 클러스터 수
 * @property generatedAt 생성 일시
 * @property metadata 메타데이터
 */
export interface GraphStatsDoc {
  id: string;
  userId: string;
  nodes: number;
  edges: number;
  clusters: number;
  generatedAt: string;
  metadata: Record<string, unknown>;
}
