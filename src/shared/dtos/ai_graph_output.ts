/**
 * 모듈: AI Graph Output DTO
 * 책임: AI 그래프 생성 모듈(Python/FastAPI)의 원시 출력 포맷을 정의한다.
 * 참고: test.json 구조 기반 (Snake Case 유지)
 */

export interface AiGraphNodeOutput {
  id: number;
  orig_id: string;
  cluster_id: string;
  cluster_name: string;
  cluster_confidence?: number;
  keywords?: Array<{ term: string; score: number }>;
  top_keywords?: string[];
  timestamp: string | null;
  num_messages: number;
}

export interface AiGraphEdgeOutput {
  source: number;
  target: number;
  weight: number;
  type: string; // e.g., "semantic"
  is_intra_cluster: boolean;
  confidence?: string;
}

export interface AiGraphClusterDetail {
  name: string;
  description: string;
  size: number;
  key_themes: string[];
}

export interface AiGraphMetadataOutput {
  generated_at: string;
  total_nodes: number;
  total_edges: number;
  total_clusters: number;
  clusters: Record<string, AiGraphClusterDetail>;
  // 기타 edge_statistics, timing 등은 현재 GraphSnapshotDto 변환에 필수적이지 않아 생략 가능
  // 필요시 추가
}

export interface AiGraphSubclusterOutput {
  id: string; // e.g. "subcluster_4_1"
  cluster_id: string; // "cluster_4"
  node_ids: number[];
  representative_node_id: number;
  size: number;
  density: number;
  top_keywords: string[];
}

export interface AiGraphOutputDto {
  nodes: AiGraphNodeOutput[];
  edges: AiGraphEdgeOutput[];
  subclusters?: AiGraphSubclusterOutput[];
  metadata: AiGraphMetadataOutput;
}
