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
  num_sections: number;
  source_type: 'chat' | 'markdown' | 'notion';
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
/**
 * AddNode 결과 내 개별 클러스터 할당/생성 정보입니다.
 * 기존의 클러스터에 배정되었거나 새로 형성된 클러스터 정보(테마, 이유 등)를 담습니다.
 * 
 * @property clusterId - 할당된 클러스터 식별자
 * @property isNewCluster - 새로운 클러스터가 생성되었는지 여부
 * @property confidence - 클러스터 배정에 대한 확신도 (최대 1.0)
 * @property reasoning - 배정 이유 (LLM 모델이 결정한 근거)
 * @property name - 클러스터 명칭
 * @property themes - 해당 클러스터의 주요 테마(키워드) 배열
 */
export interface AiAddNodeClusterInfo {
  clusterId: string;
  isNewCluster: boolean;
  confidence: number;
  reasoning: string;
  name: string;
  themes: string[];
}

/**
 * AI 모듈에서 반환되는 AddNode 단일 노드 결과 형식입니다.
 * 파이썬 AI 로직의 return schema 형식을 정확히 따르며 카멜케이스(CamelCase)를 사용합니다.
 * (임베딩 및 sourceType은 제외되어 반환됨)
 * 
 * @property id - DB와 호환되는 기록 고유 식별자 (예: "{userId}_{conversationId}")
 * @property userId - 사용자 식별자
 * @property origId - 원본 대화 식별자 (Conversation ID)
 * @property clusterId - 속하게 될(또는 새롭게 생성된) 클러스터 식별자
 * @property clusterName - 할당된 클러스터의 이름
 * @property numMessages - 이 대화(노드)에 포함된 원본 메시지(Q-A)의 개수
 * @property timestamp - 타임스탬프 (기본 null)
 * @property createdAt - 노드(대화) 생성 시각 (기본 null)
 * @property updatedAt - 노드(대화) 업데이트 시각 (기본 null)
 */
export interface AiAddNodeNodeOutput {
  id: string; // E.g., "{userId}_{conversationId}"
  userId: string;
  origId: string; 
  clusterId: string;
  clusterName: string;
  numMessages: number;
  timestamp: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * AI 모듈에서 새로운 노드와 기존 노드 간 연결된 엣지를 반환하는 형태입니다.
 * 
 * @property source - 엣지의 시작점 (대개 새로 추가되는 대화 노드의 id)
 * @property target - 엣지의 도착점 (클러스터 내의 후보군 기존 노드 id)
 * @property weight - 두 노드 간의 코사인 유사도 등에 기반한 가중치
 * @property type - 엣지 관계 유형 (e.g. "similarity")
 * @property intraCluster - 같은 클러스터 내부인지 여부 (통상 true)
 */
export interface AiAddNodeEdgeOutput {
  source: string;     // Uses record_id
  target: string | number; // the id of the target node in DB (could be number)
  weight: number;
  type: string;
  intraCluster: boolean;
}

/**
 * 배치 형태로 요청된 개별 대화(Conversation) 생성/분석 결과입니다.
 * 개별 대화의 노드 배열, 엣지 배열, 클러스터 정보, 그리고 기타 디버그 정보(outputDev)를 갖습니다.
 */
export interface AiAddNodeResultItem {
  conversationId: string;
  nodes: AiAddNodeNodeOutput[];
  edges: AiAddNodeEdgeOutput[];
  outputDev?: any;
  assignedCluster: AiAddNodeClusterInfo;
}

/**
 * AddNode 컨테이너 처리의 최종 종합 결과 (Batch Result)
 * @property userId - 사용자 ID
 * @property processedCount - 성공적으로 처리된 대화 개수
 * @property results - 각 대화별 처리 결과 내역 목록
 */
export interface AiAddNodeBatchResult {
  userId: string;
  processedCount: number;
  results: AiAddNodeResultItem[];
}

/**
 * AI 서버의 Microscope Ingest 프로세스 완료 후 응답되는 DTO 형식입니다.
 * 
 * @property user_id - 요청자 ID
 * @property group_id - 요청 그룹 ID
 * @property status - 처리 상태 ("COMPLETED" 또는 "FAILED")
 * @property source_id - 인제스트 후 문서에 부여된 고유 식별자
 * @property chunks_count - 문서를 분할한 총 청크 단위 수
 * @property ingest_stats - 저장된 개체, 관계, 청크 등의 각종 통계 정보
 * @property error - 에러 발생 시 상세 메시지
 */
export interface AiMicroscopeIngestResult {
  user_id: string;
  group_id: string;
  status: 'COMPLETED' | 'FAILED';
  source_id?: string;
  chunks_count?: number;
  schema_name?: string;
  ingest_stats?: Record<string, any>; // {"chunks_stored": 10, "entities_stored": 20, ...}
  error?: string;
}

/**
 * AI 서버의 standardized.json 다운로드 결과 내 개별 청크(배치) 그래프 구조입니다.
 * 긴 문서를 처리할 때 배열로 분할(chunking)하여 각각의 구간에서 추출된 graph 쌍이 리스트 요소로 응답됩니다.
 * (AI 모델이 식별자 id를 부여하지 않기 때문에 id 필드는 존재하지 않습니다.)
 * 
 * @property nodes - 해당 청크에서 추출되고 규격화된 노드 배열
 *   - name: 노드명
 *   - type: 메타데이터 타입 (예: Paper, Method, Tool 등)
 *   - description: 개념에 대한 AI의 요약 설명
 *   - source_chunk_id: 이 노드가 추출된 원본 문서의 청크 인덱스 (0부터 시작)
 * @property edges - 해당 청크에서 추출되고 규격화된 엣지 배열
 *   - start: 엣지 출발 노드명 (name과 일치)
 *   - target: 엣지 도착 노드명 (name과 일치)
 *   - type: 엣지 관의 관계 타입 (예: uses, defines 등)
 *   - description: AI가 포착한 두 노드 관계의 설명
 *   - source_chunk_id: 이 엣지가 추출된 원본 문서의 청크 인덱스
 *   - evidence: 관계에 대한 구체적인 본문 근거 문장 (옵션)
 *   - confidence: 관계 추출에 대한 AI의 확신도 (옵션)
 */
export interface AiMicroscopeIngestResultItem {
  nodes: {
    name: string;
    type: string;
    description: string;
    source_chunk_id: number | null;
  }[];
  edges: {
    start: string;
    target: string;
    type: string;
    description: string;
    source_chunk_id?: number | null;
    evidence?: string;
    confidence?: number;
  }[];
}

