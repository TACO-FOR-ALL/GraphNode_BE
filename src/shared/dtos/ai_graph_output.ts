/**
 * AI Graph Output DTOs (External Contract)
 * 책임: AI 서버(Python)의 출력 스키마와 1:1 매핑을 보장한다.
 * 특징: Python 컨벤션에 따라 snake_case를 사용한다.
 * 변경: AI 서버의 schema.py가 변경되면 이 파일도 반드시 변경되어야 한다.
 */

export interface OverviewSection {
  total_conversations: number;
  time_span: string; // "YYYY-MM-DD ~ YYYY-MM-DD" or "N/A"
  primary_interests: string[];
  conversation_style: string;
  most_active_period: string; // "평일 오후", "N/A"
  summary_text: string;
}

export interface ClusterAnalysis {
  cluster_id: string; // "cluster_1"
  name: string;
  size: number;
  density: number; // 0.0 - 1.0
  centrality: number; // 0.0 - 1.0
  recency: 'active' | 'dormant' | 'new' | 'unknown';
  top_keywords: string[];
  key_themes: string[];
  common_question_types: string[];
  insight_text: string;
  notable_conversations: string[]; // Node IDs
}

export interface Pattern {
  pattern_type: 'repetition' | 'progression' | 'gap' | 'bridge';
  description: string;
  evidence: string[]; // Node IDs
  significance: 'high' | 'medium' | 'low';
}

export interface ClusterConnection {
  source_cluster: string;
  target_cluster: string;
  connection_strength: number; // 0.0 - 1.0
  bridge_keywords: string[];
  description: string;
}

export interface Recommendation {
  type: 'consolidate' | 'explore' | 'review' | 'connect';
  title: string;
  description: string;
  related_nodes: string[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * Main Summary Object
 */
export interface GraphSummary {
  overview: OverviewSection;
  clusters: ClusterAnalysis[];
  patterns: Pattern[];
  connections: ClusterConnection[];
  recommendations: Recommendation[];
  generated_at: string; // ISO 8601
  detail_level: 'brief' | 'standard' | 'detailed';
}

/**
 * Legacy/Generation DTOs (Restored for graph_ai_input.mapper.ts)
 */
export interface AiGraphNodeOutput {
  id: number;
  orig_id: string;
  cluster_id: string;
  cluster_name: string;
  cluster_confidence?: number;
  keywords: { term: string; score: number }[];
  top_keywords: string[];
  timestamp: string | null;
  num_messages: number;
}

export interface AiGraphEdgeOutput {
  source: number;
  target: number;
  weight: number;
  type: 'hard' | 'insight';
  is_intra_cluster: boolean;
  confidence?: string | number;
}

export interface AiGraphClusterDetail {
  name: string;
  description: string;
  size: number;
  key_themes: string[];
}

export interface AiGraphSubclusterOutput {
  id: string;
  cluster_id: string;
  node_ids: number[];
  representative_node_id: number;
  size: number;
  density: number;
  top_keywords: string[];
}

export interface AiGraphOutputDto {
  nodes: AiGraphNodeOutput[];
  edges: AiGraphEdgeOutput[];
  subclusters: AiGraphSubclusterOutput[];
  metadata: {
    generated_at: string;
    total_nodes: number;
    total_edges: number;
    total_clusters: number;
    clusters: Record<string, AiGraphClusterDetail>;
    language?: string;
  };
}

/**
 * AddNode (Batch) Result DTOs
 */
export interface AiAddNodeClusterInfo {
  clusterId: string;
  isNewCluster: boolean;
  confidence: number;
  reasoning: string;
  name: string;
  themes: string[];
}

export interface AiAddNodeNodeOutput {
  id: string; // E.g., "{userId}_{conversationId}"
  userId: string;
  origId: string; 
  clusterId: string;
  clusterName: string;
  numMessages: number;
  embedding: number[];
  timestamp: string | null;
}

export interface AiAddNodeEdgeOutput {
  source: string;     // Uses record_id
  target: string | number; // the id of the target node in DB (could be number)
  weight: number;
  type: string;
  intraCluster: boolean;
}

export interface AiAddNodeResultItem {
  conversationId: string;
  nodes: AiAddNodeNodeOutput[];
  edges: AiAddNodeEdgeOutput[];
  outputDev?: any;
  assignedCluster: AiAddNodeClusterInfo;
}

export interface AiAddNodeBatchResult {
  userId: string;
  processedCount: number;
  results: AiAddNodeResultItem[];
}

