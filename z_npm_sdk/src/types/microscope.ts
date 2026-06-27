import type { PlanLimitExceededProblemDetails } from './problem.js';

/**
 * 마이크로 공간(Microscope) 워크스페이스 생성 시 플랜 한도 초과 에러 컨트랙트입니다.
 *
 * BM/플랜 한도 초과로 인해 백엔드에서 PlanLimitExceededError가 발생하면
 * HTTP 402 Payment Required 상태 코드와 함께 반환됩니다.
 *
 * @public
 */
export type CreateWorkspacePlanLimitExceededError = PlanLimitExceededProblemDetails;

/**
 * @public
 * Microscope 문서(Document) DTO입니다. 하나의 소스(노트/대화)에 대한 Ingest 작업 상태와 결과를 나타냅니다.
 * @property id 문서 ID
 * @property s3Key S3 키 (내부용, 미사용)
 * @property fileName 파일 이름
 * @property status 전체 문서 처리 상태입니다. block 및 non-block 파이프라인이 모두 완료되어야 `COMPLETED`가 됩니다.
 * @property nodeId 원본 노드 ID
 * @property nodeType 원본 노드 타입
 * @property sourceId 소스 ID
 * @property graphPayloadId Non-block 파이프라인 Microscope Graph 획득용 ID
 * @property error 에러 메시지
 * @property createdAt 생성일
 * @property updatedAt 업데이트일
 * @property blockModeRequested Block 파이프라인 요청 여부입니다. `true`이면 block 파이프라인도 함께 실행됩니다.
 * @property blockStatus Block 파이프라인 처리 상태입니다. `blockModeRequested`가 `true`인 경우에만 존재합니다.
 * @property nonBlockStatus Non-block 파이프라인 처리 상태입니다.
 * @property blockGraphPayloadId Block 파이프라인 결과 획득용 ID입니다.
 * @property blockGraphS3Key Block 그래프 데이터의 S3 키입니다. 데이터가 10MB를 초과하는 경우 FE가 이 키를 통해 S3에서 직접 조회합니다.
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
  blockModeRequested?: boolean;
  blockStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  nonBlockStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  blockGraphPayloadId?: string;
  blockGraphS3Key?: string;
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
