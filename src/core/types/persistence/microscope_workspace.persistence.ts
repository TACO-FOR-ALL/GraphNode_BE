/**
 * Microscope 워크스페이스 메타데이터 및 진행 상태를 MongoDB에서 추적하기 위한 영속성 스키마입니다.
 * 이 구조는 실제 그래프 데이터(Neo4j)를 보관하지 않으며, 오직 "어떤 파일들이 속해있고, AI 처리가 끝났는지"만을 추적합니다.
 */



export type MicroscopeDocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** GraphNode_AI microscope 파이프라인: from_graphnode | raw_file */
export type MicroscopeIngestMode = 'from_graphnode' | 'raw_file';

/** AI 출력 모드: block → block_graph.json, non_block → standardized.json */
export type MicroscopeOutputMode = 'block' | 'non_block';

/** Microscope ingest 완료 시 S3 시각화 키 스냅샷. */
export interface MicroscopeDocumentVisualizationMeta {
  outputMode?: MicroscopeOutputMode;
  visualizationS3Key?: string;
  standardizedS3Key?: string;
  blockGraphS3Key?: string;
  imagesS3Prefix?: string;
}

/**
 * 개별 업로드 문서의 메타데이터 및 상태
 * @property id 내부 고유 식별자 (ULID) - 
 * @property s3Key 원본 파일의 S3 경로
 * @property fileName 사용자에게 보여질 원본 파일명
 * @property status AI 워커 처리 상태
 * @property nodeId note/conversation/notion/file 기반 ingest일 때 원본 노드 ID
 * @property nodeType 원본 노드 유형. Microscope 런타임 마이그레이션은 보류하지만 미래 호환을 위해 notion/file을 허용
 * @property sourceId AI 워커 처리가 성공하면 부여되는 고유 문서 식별자 (Neo4j에 매핑됨)
 * @property graphPayloadId AI 워커 처리가 성공하면 부여되는 고유 그래프 페이로드 식별자 (MongoDB에 매핑됨)
 * @property error 실패 시의 에러 원인
 * @property createdAt 등록 일시
 * @property updatedAt 최종 상태 변경 일시
 */
export interface MicroscopeDocumentMetaDoc {
  /** 내부 고유 식별자입니다. */
  id: string;
  /** 원본 파일의 S3 경로입니다. */
  s3Key: string;
  /** 사용자에게 보여질 원본 파일명입니다. */
  fileName: string;
  /** AI 워커 처리 상태입니다. */
  status: MicroscopeDocumentStatus;
  /** note/conversation/notion/file 기반 ingest일 때 원본 노드 ID입니다. */
  nodeId?: string;
  /** 원본 노드 유형입니다. Microscope 런타임 마이그레이션은 보류하지만 미래 호환을 위해 notion/file을 허용합니다. */
  nodeType?: 'note' | 'conversation' | 'notion' | 'file';
  /** AI 워커 처리가 성공하면 부여되는 고유 문서 식별자입니다. */
  sourceId?: string;
  /** AI 워커 처리가 성공하면 부여되는 고유 그래프 페이로드 식별자입니다. */
  graphPayloadId?: string;
  /** 요청 ingest 파이프라인 (GraphNode_AI `microscope/from_graphnode` | `raw_file`). */
  ingestMode?: MicroscopeIngestMode;
  /** 요청 시 block 모드 사용 여부 (AI가 block_graph vs standardized 출력 선택). */
  blockModeRequested?: boolean;
  /** 완료 시 AI 출력 모드. */
  outputMode?: MicroscopeOutputMode;
  /** FE 시각화용 대표 S3 키 (standardized.json 또는 block_graph.json). */
  visualizationS3Key?: string;
  /** non-block 모드 결과 S3 키 (`standardized.json`). */
  standardizedS3Key?: string;
  /** block 모드 결과 S3 키 (`block_graph.json`). */
  blockGraphS3Key?: string;
  /** PPT/DOCX 등 block 모드 부가 이미지 prefix (`images/`). */
  imagesS3Prefix?: string;
  /** block 파이프라인 처리 상태입니다. 듀얼 SQS 모드에서만 기록됩니다. */
  blockStatus?: MicroscopeDocumentStatus;
  /** non-block 파이프라인 처리 상태입니다. 듀얼 SQS 모드에서만 기록됩니다. */
  nonBlockStatus?: MicroscopeDocumentStatus;
  /** block 파이프라인 결과 MongoDB 페이로드 ID입니다. */
  blockGraphPayloadId?: string;
  /** 실패 시의 에러 원인입니다. */
  error?: string;
  /** 등록 일시입니다. */
  createdAt: string;
  /** 최종 상태 변경 일시입니다. */
  updatedAt: string;
}

/**
 * 워크스페이스(그룹) 메타데이터 저장 구조
 * @property _id 워크스페이스의 논리적 식별자 (ULID/UUID). = Neo4j의 group_id
 * @property userId 소유 유저 식별자
 * @property name 워크스페이스 이름
 * @property documents 업로드된 파일들의 목록 및 개별 처리 상태
 * @property createdAt 생성 일시
 * @property updatedAt 최종 수정 일시
 */
export interface MicroscopeWorkspaceMetaDoc {
  _id: string;
  userId: string;
  name: string;
  documents: MicroscopeDocumentMetaDoc[];
  createdAt: string;
  updatedAt: string;
}

/**
 * AI 워커가 생성한 지식 그래프 원본 데이터를 저장하기 위한 페이로드 컬렉션 구조.
 * 16MB 용량 제한을 우회하기 위해 워크스페이스 메타데이터와 분리하여 저장합니다.
 * 
 * @property _id 고유 ID (mongodb objectid 혹은 ulid)
 * @property groupId 소속된 워크스페이스 ID
 * @property taskId 대응되는 문서 작업 ID
 * @property userId 소유자 ID
 * @property graphData 병합 전 원본 그래프 데이터 객체
 * @property createdAt 저장 일시
 */
export interface MicroscopeGraphPayloadDoc {
  _id: string;
  groupId: string;
  taskId: string;
  userId: string;
  graphData: { nodes: MicroscopeGraphNodeDoc[]; edges: MicroscopeGraphEdgeDoc[] };
  createdAt: string;
}

/**
 * Microscope 워커가 생성한 그래프 노드 DTO
 * @property id 노드 고유 식별자
 * @property name 노드 이름
 * @property type 노드 타입
 * @property description 노드 설명
 * @property source_chunk_id 소스 청크 ID
 */
export interface MicroscopeGraphNodeDoc {
  id: string;
  name: string;
  type: string;
  description: string;
  source_chunk_id:  number | null;
}

/**
 * Microscope 워커가 생성한 그래프 엣지 DTO
 * @property id 엣지 고유 식별자
 * @property start 엣지 시작점
 * @property target 엣지 도착점
 * @property type 엣지 타입
 * @property description 엣지 설명
 * @property source_chunk_id 소스 청크 ID
 * @property evidence 엣지 증거
 * @property confidence 엣지 신뢰도
 */
export interface MicroscopeGraphEdgeDoc {
  id: string;
  start: string;
  target: string;
  type: string;
  description: string;
  source_chunk_id?:  number | null;
  evidence: string;
  confidence: number;
}

/** block_graph.json 의 블록 간 엣지 타입 */
export type MicroscopeBlockEdgeType =
  | 'PREREQUISITE_OF'
  | 'FOLLOWS'
  | 'ELABORATES'
  | 'CONTRASTS'
  | 'PARALLEL';

/**
 * AI Block 뷰의 블록 간 엣지 구조 (inter-block DAG edge)
 */
export interface MicroscopeBlockEdgeDoc {
  source: string;
  target: string;
  type: MicroscopeBlockEdgeType;
  description?: string;
  confidence?: number;
}

/**
 * AI Block 뷰의 단일 블록 (rawText 제외 메타데이터)
 */
export interface MicroscopeBlockItemDoc {
  block_id: string;
  title: string;
  summary?: string;
  key_concepts: string[];
  order_index: number;
  turn_range?: [number, number] | null;
  micro_graph: {
    nodes: MicroscopeGraphNodeDoc[];
    edges: MicroscopeGraphEdgeDoc[];
  };
}

/**
 * AI가 생성한 Block Graph 구조 (rawText 미포함)
 * microscope_block_graph_payloads 컬렉션에 저장됩니다.
 */
export interface MicroscopeBlockGraphPayloadDoc {
  _id: string;
  groupId: string;
  /** document의 base taskId (_block 접미사 제거 후) */
  taskId: string;
  userId: string;
  blockGraph: {
    blocks: MicroscopeBlockItemDoc[];
    edges: MicroscopeBlockEdgeDoc[];
    paths: string[][];
    ordering_rationale?: string;
  };
  createdAt: string;
}

/**
 * 각 블록의 원문(rawText)을 별도 컬렉션에 저장합니다 (16MB 제한 분산 목적).
 * microscope_block_rawtext_payloads 컬렉션에 저장됩니다.
 * rawTexts 총 크기가 10MB를 초과하면 저장하지 않으며, FE는 blockGraphS3Key 통해 lazy load 합니다.
 */
export interface MicroscopeBlockRawTextPayloadDoc {
  _id: string;
  groupId: string;
  /** document의 base taskId */
  taskId: string;
  userId: string;
  rawTexts: Array<{ blockId: string; rawText: string }>;
  createdAt: string;
}
