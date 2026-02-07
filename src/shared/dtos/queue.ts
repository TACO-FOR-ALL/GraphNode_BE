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
  ADD_CONVERSATION_REQUEST = 'ADD_CONVERSATION_REQUEST', // API -> AI (single conversation)
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
    error?: string; // 실패 시 에러 메시지
  };
}

// 3. API -> AI: 그래프 요약 생성 요청 메시지
export interface GraphSummaryRequestPayload extends BaseQueueMessage {
  taskType: TaskType.GRAPH_SUMMARY_REQUEST;
  payload: {
    userId: string;
    chatId?: string;
    graphS3Key: string; // 요약할 대상 그래프(graph_postprocessed.json) S3 키
    bucket: string;
    vectorDbS3Key?: string; //  Vector DB 경로 (Optional)
  };
}

// 4. AI -> Worker: 그래프 요약 생성 완료 결과 메시지
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
export interface AddConversationRequestPayload extends BaseQueueMessage {
  taskType: TaskType.ADD_CONVERSATION_REQUEST;
  payload: {
    userId: string;
    conversationId: string;
    s3Key: string;
    bucket?: string;
  };
}

// 전체 메시지 유니온 타입 (확장성을 위해)
export type QueueMessage =
  | GraphGenRequestPayload
  | GraphGenResultPayload
  | GraphSummaryRequestPayload
  | GraphSummaryResultPayload | AddConversationRequestPayload;
