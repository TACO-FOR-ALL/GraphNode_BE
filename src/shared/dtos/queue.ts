/**
 * SQS 메시지 타입 정의
 * Producer(API/AI)와 Consumer(Worker) 간의 계약입니다.
 *
 * 구조: Envelope Pattern
 * - type: 메시지 처리기를 분기하기 위한 식별자
 * - payload: 실제 데이터
 * - timestamp: 발행 시각
 */

// 작업 타입 열거
export enum TaskType {
  GRAPH_GENERATION_REQUEST = 'GRAPH_GENERATION_REQUEST', // API -> AI
  GRAPH_GENERATION_RESULT = 'GRAPH_GENERATION_RESULT', // AI -> Worker
  GRAPH_SUMMARY_REQUEST = 'GRAPH_SUMMARY_REQUEST', // API -> AI (Summary only)
  GRAPH_SUMMARY_RESULT = 'GRAPH_SUMMARY_RESULT', // AI -> Worker (Summary result)
  ADD_NODE_REQUEST = 'ADD_NODE_REQUEST', // API -> AI (single conversation)
  ADD_NODE_RESULT = 'ADD_NODE_RESULT', // AI -> Worker (AddNode result)
  MICROSCOPE_INGEST_FROM_NODE_REQUEST = 'MICROSCOPE_INGEST_FROM_NODE_REQUEST', // API -> AI (Microscope document ingest)
  MICROSCOPE_INGEST_FROM_NODE_RESULT = 'MICROSCOPE_INGEST_FROM_NODE_RESULT', // AI -> Worker (Microscope ingest result)
}

// 공통 메시지 베이스
/**
 * 공통 Queue 메시지 속성
 * - taskId: 작업 고유 ID (Correlation ID)
 * - timestamp: 메시지 생성 시각 (ISO String)
 */
export interface BaseQueueMessage {
  taskId: string; // 작업 고유 ID (Correlation ID)
  timestamp: string; // ISO String
}

// 1. API -> AI: 그래프 생성 요청 메시지
/**
 * 그래프 생성 요청 메시지 페이로드(API -> AI)
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 요청 데이터
 *  - userId: 요청한 사용자 ID
 * - s3Key: 입력 데이터가 담긴 S3 키
 * - bucket: 버킷명 (옵션)
 */
export interface GraphGenRequestPayload extends BaseQueueMessage {
  taskType: TaskType.GRAPH_GENERATION_REQUEST;
  payload: {
    userId: string;
    s3Key: string; // 입력 데이터가 담긴 S3 키
    bucket?: string; // 버킷명 (옵션)
    includeSummary?: boolean; // 요약 파이프라인 동시 실행 여부
    summaryLanguage?: string; // 요약 언어
    inputType?: string; // 'chat' 
    extraS3Keys?: string[]; // 추가 소스(마크다운 등)의 s3 키 배열
  };
}

// 2. AI -> Worker: 그래프 생성 완료 결과 메시지
/**
 * 그래프 생성 결과 메시지 페이로드(AI -> Worker)
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 결과 데이터
 * - userId: 요청한 사용자 ID
 * - status: 작업 상태 ('COMPLETED' | 'FAILED')
 * - resultS3Key: 성공 시 결과 JSON이 담긴 S3 키
 * - error: 실패 시 에러 메시지
 * /
 */
export interface GraphGenResultPayload extends BaseQueueMessage {
  taskType: TaskType.GRAPH_GENERATION_RESULT;
  payload: {
    userId: string;
    status: 'COMPLETED' | 'FAILED';
    resultS3Key?: string; // 성공 시 결과 JSON이 담긴 S3 키
    featuresS3Key?: string; // 성공 시 Features JSON이 담긴 S3 키 (Vector DB용)
    summaryIncluded?: boolean; // 요약 파이프라인 동시 실행 결과 여부
    summaryS3Key?: string; // 요약 데이터가 담긴 S3 키
    error?: string; // 실패 혹은 부분 실패(요약 실패) 시 에러 메시지
  };
}

// 3. API -> AI: 그래프 요약 생성 요청 메시지
/**
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 요청 데이터
 *  - userId: 요청한 사용자 ID
 *  - chatId: 대화 ID
 *  - graphS3Key: 요약할 대상 그래프(graph_postprocessed.json) S3 키
 *  - bucket: 버킷명 (옵션)
 *  - vectorDbS3Key: Vector DB 경로 (옵션)
 *  - language: 사용자의 선호 언어 (ko, en, zh 등)
 */
export interface GraphSummaryRequestPayload extends BaseQueueMessage {
  taskType: TaskType.GRAPH_SUMMARY_REQUEST;
  payload: {
    userId: string;
    chatId?: string;
    graphS3Key: string; // 요약할 대상 그래프(graph_postprocessed.json) S3 키
    bucket: string;
    vectorDbS3Key?: string; //  Vector DB 경로 (Optional)
    language?: string; // 사용자의 선호 언어 (ko, en, zh 등)
  };
}

// 4. AI -> Worker: 그래프 요약 생성 완료 결과 메시지
/**
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 결과 데이터
 * - userId: 요청한 사용자 ID
 * - status: 작업 상태 ('COMPLETED' | 'FAILED')
 * - summaryS3Key: 성공 시 요약 JSON Key
 * - error: 실패 시 에러 메시지
 */
export interface GraphSummaryResultPayload extends BaseQueueMessage {
  taskType: TaskType.GRAPH_SUMMARY_RESULT;
  payload: {
    userId: string;
    status: 'COMPLETED' | 'FAILED';
    summaryS3Key?: string; // 성공 시 요약 JSON Key
    error?: string;
  };
}

// 3. API -> AI: 단일 대화 추가 요청 메시지
/**
 * 단일 대화 추가 요청 메시지 페이로드(API -> AI)
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 요청 데이터
 *  - userId: 요청한 사용자 ID
 *  - conversationId: 추가할 대화 ID
 *  - s3Key: 입력 데이터가 담긴 S3 키
 *  - bucket: 버킷명 (옵션)
 */
export interface AddNodeRequestPayload extends BaseQueueMessage {
  taskType: TaskType.ADD_NODE_REQUEST;
  payload: {
    userId: string;
    s3Key: string;
    bucket?: string;
  };
}

// 6. AI -> Worker: AddNode 완료 결과 메시지
/**
 * 단일 대화 추가 결과 메시지 페이로드(AI -> Worker)
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 결과 데이터
 *  - userId: 요청한 사용자 ID
 *  - status: 작업 상태 ('COMPLETED' | 'FAILED')
 *  - resultS3Key: 성공 시 결과 JSON이 담긴 S3 키
 *  - error: 실패 시 에러 메시지
 */
export interface AddNodeResultPayload extends BaseQueueMessage {
  taskType: TaskType.ADD_NODE_RESULT;
  payload: {
    userId: string;
    status: 'COMPLETED' | 'FAILED';
    resultS3Key?: string;
    error?: string;
  };
}

// 7. API -> AI: Microscope Ingest Request
/**
 * Microscope 문서 분석 요청 메시지 페이로드 (API -> SQS -> AI Worker)
 * 사용자가 워크스페이스에 새로 업로드한 문서를 분석하여 지식 그래프를 생성하라는 요청입니다.
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 요청 데이터
 *  - user_id: 요청한 사용자 ID
 *  - group_id: 문서를 묶는 작업 공간의 식별자. Mongo의 Workspace _id와 동일하며 Neo4j에서 그룹을 분리하는 데 사용됩니다.
 *  - s3_key: S3에서 원본 문서를 다운로드하기 위한 Key
 *  - bucket: S3 버킷 명
 *  - file_name: AI 워커가 문서 파싱 및 시각화를 위해 활용하는 원본 파일명 (예: 'policy.pdf')
 *  - schema_name: (옵션) 추출에 사용할 특정 ER 스키마 제약사항 명칭
 */
export interface MicroscopeIngestFromNodeQueuePayload extends BaseQueueMessage {
  taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_REQUEST;
  payload: {
    /** Python 런타임 호환을 위한 snake_case 유저 식별자 */
    user_id: string; 
    /** 문서를 묶는 작업 공간의 식별자. Mongo의 Workspace _id와 동일하며 Neo4j에서 그룹을 분리하는 데 사용됩니다. */
    group_id: string;
    /** S3에서 원본 문서를 다운로드하기 위한 Key */
    s3_key: string;
    /** S3 버킷 명 */
    bucket: string;
    /** AI 워커가 문서 파싱 및 시각화를 위해 활용하는 원본 파일명 (예: 'policy.pdf') */
    file_name: string;
    /** (옵션) 추출에 사용할 특정 ER 스키마 제약사항 명칭 */
    schema_name?: string;
  };
}

// 8. AI -> Worker: Microscope Ingest Result
/**
 * Microscope 문서 분석 완료/추가 결과 메시지 페이로드 (AI Worker -> SQS -> API/Handler)
 * AI 서버가 문서를 파싱하고 지식 그래프 노드 및 엣지를 생성한 뒤 그 결과를 반환하는 메시지입니다.
 * - taskType: 메시지 타입 식별자
 * - payload: 실제 결과 데이터
 *  - user_id: 요청한 사용자 ID
 *  - group_id: 작업이 진행된 워크스페이스의 식별자
 *  - status: 작업 최종 상태 (성공 또는 실패)
 *  - source_id: (성공 시) 새로 파싱되어 Neo4j에 기록된 문서 청크들의 최상위 소스 노드 uuid
 *  - chunks_count: (성공 시) 문서에서 추출된 총 청크 단위 개수 (통계용)
 *  - schema_name: (선택 사항) 사용된 스키마 이름 반환
 *  - ingest_stats: (선택 사항) AI 파이프라인 처리에 소요된 상세 통계 객체 (토큰, 메타데이터 등)
 *  - error: (실패 시) 발생한 치명적 파이프라인 에러 메세지
 */
export interface MicroscopeIngestFromNodeResultQueuePayload extends BaseQueueMessage {
  taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT;
  payload: {
    /** Python 런타임 호환을 위한 snake_case 유저 식별자 */
    user_id: string; 
    /** 작업이 진행된 워크스페이스의 식별자 */
    group_id: string;
    /** 작업 최종 상태 (성공 또는 실패) */
    status: 'COMPLETED' | 'FAILED';
    /** (성공 시) 새로 파싱되어 Neo4j에 기록된 문서 청크들의 최상위 소스 노드 uuid */
    source_id?: string;
    /** (성공 시) 문서에서 추출된 총 청크 단위 개수 (통계용) */
    chunks_count?: number;
    /** (선택 사항) 사용된 스키마 이름 반환 */
    schema_name?: string;
    /** (선택 사항) AI 파이프라인 처리에 소요된 상세 통계 객체 (토큰, 메타데이터 등) */
    ingest_stats?: any;
    /** (성공 시) S3에 저장된 표준 JSON 파일 키 */
    standardized_s3_key?: string;
    /** (실패 시) 발생한 치명적 파이프라인 에러 메세지 */
    error?: string;
  };
}

// 전체 메시지 유니온 타입 (확장성을 위해)
export type QueueMessage =
  | GraphGenRequestPayload
  | GraphGenResultPayload
  | GraphSummaryRequestPayload
  | GraphSummaryResultPayload
  | AddNodeRequestPayload
  | AddNodeResultPayload
  | MicroscopeIngestFromNodeQueuePayload
  | MicroscopeIngestFromNodeResultQueuePayload;

