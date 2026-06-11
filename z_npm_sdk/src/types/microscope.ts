/**
 * @public
 * microscope 문서
 * @param id 문서 ID
 * @param s3Key S3 키 > 안씀
 * @param fileName 파일 이름
 * @param status 문서 상태
 * @param nodeId 원본 노드 ID
 * @param nodeType 원본 노드 타입
 * @param sourceId 소스 ID
 * @param graphPayloadId Microscope Graph 획득용 ID
 * @param error 에러
 * @param createdAt 생성일
 * @param updatedAt 업데이트일
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
 * @param _id 워크스페이스 ID
 * @param userId 유저 ID
 * @param name 워크스페이스 이름
 * @param documents 문서 목록
 * @param createdAt 생성일
 * @param updatedAt 업데이트일
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
 * @param id 노드 ID
 * @param name 노드 이름
 * @param type 노드 타입
 * @param description 노드 설명
 * @param source_chunk_id 소스 청크 ID
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
 * @param id 엣지 ID
 * @param start 시작 노드 ID
 * @param target 끝 노드 ID
 * @param type 엣지 타입
 * @param description 엣지 설명
 * @param source_chunk_id 소스 청크 ID
 * @param evidence 엣지 증거
 * @param confidence 엣지 신뢰도
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
 * @param source 시작 블록 ID
 * @param target 도착 블록 ID
 * @param type 엣지 유형
 * @param description 엣지 설명
 * @param confidence 신뢰도 (0~1)
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
 * @param block_id 블록 고유 ID
 * @param title 블록 제목
 * @param summary 블록 요약
 * @param key_concepts 핵심 개념 목록
 * @param order_index 정렬 순서
 * @param turn_range 원문 턴 범위 (대화 기반 ingest 시)
 * @param micro_graph 블록 내부 micro 그래프 (노드/엣지)
 * @param raw_text 블록 원문 (가용 시)
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
 * @param blocks 블록 목록
 * @param edges 블록 간 DAG 엣지 목록
 * @param paths 추천 학습 경로 (블록 ID 배열)
 * @param ordering_rationale 블록 정렬 근거
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
 * @param nodes 노드 목록 (non-block 파이프라인 결과)
 * @param edges 엣지 목록 (non-block 파이프라인 결과)
 * @param blockView Block 뷰 데이터 (block 파이프라인 완료 후 제공, optional)
 */
export interface MicroscopeGraphData {
  nodes: MicroscopeGraphNode[];
  edges: MicroscopeGraphEdge[];
  blockView?: MicroscopeBlockGraph;
}
