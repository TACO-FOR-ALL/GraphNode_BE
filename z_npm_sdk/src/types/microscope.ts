/**
 * @public
 * microscope 문서
 * @property id 문서 ID
 * @property s3Key S3 키 > 안씀
 * @property fileName 파일 이름
 * @property status 문서 상태
 * @property nodeId 원본 노드 ID
 * @property nodeType 원본 노드 타입
 * @property sourceId 소스 ID
 * @property graphPayloadId Microscope Graph 획득용 ID
 * @property error 에러
 * @property createdAt 생성일
 * @property updatedAt 업데이트일
 */
export interface MicroscopeDocument {
  id: string;
  s3Key: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  nodeId?: string;
  nodeType?: 'note' | 'conversation';
  sourceId?: string;
  graphPayloadId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}




/**
 * @public
 * microscope 워크스페이스
 * @property _id 워크스페이스 ID
 * @property userId 유저 ID
 * @property name 워크스페이스 이름
 * @property documents 문서 목록
 * @property createdAt 생성일
 * @property updatedAt 업데이트일
 */
export interface MicroscopeWorkspace {
  _id: string;
  userId: string;
  name: string;
  documents: MicroscopeDocument[];
  createdAt: string;
  updatedAt: string;
}

/**
 * @public
 * microscope 그래프 노드
 * @property id 노드 ID
 * @property name 노드 이름
 * @property type 노드 타입
 * @property description 노드 설명
 * @property source_chunk_id 소스 청크 ID
 */
export interface MicroscopeGraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  source_chunk_id: number | null;
}



/**
 * @public
 * microscope 그래프 엣지
 * @property id 엣지 ID
 * @property start 시작 노드 ID
 * @property target 끝 노드 ID
 * @property type 엣지 타입
 * @property description 엣지 설명
 * @property source_chunk_id 소스 청크 ID
 * @property evidence 엣지 증거
 * @property confidence 엣지 신뢰도
 */
export interface MicroscopeGraphEdge {
  id: string;
  start: string;
  target: string;
  type: string;
  description: string;
  source_chunk_id?: number | null;
  evidence: string;
  confidence: number;
}

/**
 * @public
 * Block 뷰 블록 간 엣지
 * @property source 시작 블록 ID
 * @property target 도착 블록 ID
 * @property type 엣지 유형
 * @property description 엣지 설명
 * @property confidence 신뢰도 (0~1)
 */
export interface MicroscopeBlockEdge {
  source: string;
  target: string;
  type: 'PREREQUISITE_OF' | 'FOLLOWS' | 'ELABORATES' | 'CONTRASTS' | 'PARALLEL';
  description?: string;
  confidence?: number;
}

/**
 * @public
 * Block 뷰 단일 블록
 * @property block_id 블록 고유 ID
 * @property title 블록 제목
 * @property summary 블록 요약
 * @property key_concepts 핵심 개념 목록
 * @property order_index 정렬 순서
 * @property turn_range 원문 턴 범위 (대화 기반 ingest 시)
 * @property micro_graph 블록 내부 micro 그래프 (노드/엣지)
 * @property raw_text 블록 원문 (가용 시)
 */
export interface MicroscopeBlockItem {
  block_id: string;
  title: string;
  summary?: string;
  key_concepts: string[];
  order_index: number;
  turn_range?: [number, number] | null;
  micro_graph: {
    nodes: MicroscopeGraphNode[];
    edges: MicroscopeGraphEdge[];
  };
  raw_text?: string;
}

/**
 * @public
 * Block 뷰 전체 구조
 * @property blocks 블록 목록
 * @property edges 블록 간 DAG 엣지 목록
 * @property paths 추천 학습 경로 (블록 ID 배열)
 * @property ordering_rationale 블록 정렬 근거
 */
export interface MicroscopeBlockGraph {
  blocks: MicroscopeBlockItem[];
  edges: MicroscopeBlockEdge[];
  paths: string[][];
  ordering_rationale?: string;
}

/**
 * @public
 * microscope 그래프 데이터
 * @property nodes 노드 목록 (non-block 파이프라인 결과)
 * @property edges 엣지 목록 (non-block 파이프라인 결과)
 * @property blockView Block 뷰 데이터 (block 파이프라인 완료 후 제공, optional)
 */
export interface MicroscopeGraphData {
  nodes: MicroscopeGraphNode[];
  edges: MicroscopeGraphEdge[];
  blockView?: MicroscopeBlockGraph;
}
