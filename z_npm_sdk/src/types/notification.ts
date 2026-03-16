/**
 * 실시간 알림(Notification) 이벤트 타입 정의
 *
 * @description
 * 서버는 비동기 작업(그래프 생성, 대화 추가, Microscope 분석 등)이
 * 완료되면 WebSocket/SSE 채널을 통해 클라이언트에 알림을 Push합니다.
 *
 * ## 흐름 개요
 * ```
 * [FE]  →  REST API 호출 (그래프 생성 요청 등)
 *              ↓
 * [Server]  SQS에 TaskType 메시지 발행
 *              ↓
 * [AI Worker]  작업 처리
 *              ↓
 * [Server] NotificationType 이벤트를 SSE/WebSocket으로 Push
 *              ↓
 * [FE]  알림 수신 → UI 갱신
 * ```
 *
 * @module notification
 * @public
 */

// ─────────────────────────────────────────────────────────────────────────────
// TaskType
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SQS 비동기 작업 파이프라인의 메시지 분류자 (Task Identifier)
 *
 * @description
 * 서버(API/AI)와 Worker 간의 SQS 메시지를 식별하는 열거형입니다.
 * 각 값은 `NotificationType`의 특정 이벤트와 1:1 또는 1:N으로 연결됩니다.
 *
 * ### 작업 방향
 * - `*_REQUEST` → API 서버가 AI Worker에 **요청**을 보낼 때 사용
 * - `*_RESULT`  → AI Worker가 API 서버 Worker에 **결과**를 돌려보낼 때 사용
 *
 * @public
 *
 * @example
 * // 어떤 TaskType을 구독하면 어떤 NotificationType이 오는지
 * TaskType.GRAPH_GENERATION_REQUEST
 *   → NotificationType.GRAPH_GENERATION_REQUESTED  (요청 수신 즉시)
 *   → NotificationType.GRAPH_GENERATION_COMPLETED  (처리 완료 시)
 *   → NotificationType.GRAPH_GENERATION_FAILED     (처리 실패 시)
 */
export enum TaskType {
  /** API → AI: 사용자의 전체 대화 데이터 기반 그래프 최초 생성 요청 */
  GRAPH_GENERATION_REQUEST = 'GRAPH_GENERATION_REQUEST',
  /** AI → Worker: 그래프 생성 완료/실패 결과 */
  GRAPH_GENERATION_RESULT = 'GRAPH_GENERATION_RESULT',

  /** API → AI: 기존 그래프 데이터를 바탕으로 요약(Summary) 생성 요청 */
  GRAPH_SUMMARY_REQUEST = 'GRAPH_SUMMARY_REQUEST',
  /** AI → Worker: 그래프 요약 완료/실패 결과 */
  GRAPH_SUMMARY_RESULT = 'GRAPH_SUMMARY_RESULT',

  /** API → AI: 새로 추가된 대화(들)를 기존 그래프에 반영(AddNode) 요청 */
  ADD_NODE_REQUEST = 'ADD_NODE_REQUEST',
  /** AI → Worker: AddNode 완료/실패 결과 */
  ADD_NODE_RESULT = 'ADD_NODE_RESULT',

  /** API → AI: Microscope 워크스페이스에 새 문서를 분석·삽입(Ingest) 요청 */
  MICROSCOPE_INGEST_FROM_NODE_REQUEST = 'MICROSCOPE_INGEST_FROM_NODE_REQUEST',
  /** AI → Worker: Microscope 문서 분석 완료/실패 결과 */
  MICROSCOPE_INGEST_FROM_NODE_RESULT = 'MICROSCOPE_INGEST_FROM_NODE_RESULT',
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationType
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FE가 SSE/WebSocket을 통해 수신하는 실시간 알림 이벤트 이름
 *
 * @description
 * `client.notification.stream(onEvent)` 콜백의 `event.type` 필드에 담겨 오는 값입니다.
 * 각 이벤트는 비동기 작업 파이프라인의 특정 단계 완료를 나타냅니다.
 *
 * @public
 *
 * @example
 * ```typescript
 * import { NotificationType } from '@taco_tsinghua/graphnode-sdk';
 *
 * const close = client.notification.stream((event) => {
 *   switch (event.type) {
 *     case NotificationType.GRAPH_GENERATION_COMPLETED:
 *       // 그래프 생성 완료 → 데이터 새로 고침
 *       refreshGraph();
 *       break;
 *     case NotificationType.GRAPH_GENERATION_FAILED:
 *       showErrorToast(event.payload?.error);
 *       break;
 *   }
 * });
 * ```
 */
export const NotificationType = {
  // ── 그래프 생성 관련 ───────────────────────────────────────────────────────
  /** 그래프 생성 요청이 서버에 정상 접수되었음 (SQS 발행 성공) */
  GRAPH_GENERATION_REQUESTED: 'GRAPH_GENERATION_REQUESTED',
  /** 그래프 생성 요청 접수 자체가 실패했음 (SQS 발행 실패) */
  GRAPH_GENERATION_REQUEST_FAILED: 'GRAPH_GENERATION_REQUEST_FAILED',
  /** AI Worker가 그래프 생성을 완료하고 DB에 반영했음 */
  GRAPH_GENERATION_COMPLETED: 'GRAPH_GENERATION_COMPLETED',
  /** AI Worker의 그래프 생성 또는 DB 반영 중 오류 발생 */
  GRAPH_GENERATION_FAILED: 'GRAPH_GENERATION_FAILED',

  // ── 그래프 요약 관련 ───────────────────────────────────────────────────────
  /** 그래프 요약 생성 요청이 서버에 정상 접수되었음 */
  GRAPH_SUMMARY_REQUESTED: 'GRAPH_SUMMARY_REQUESTED',
  /** 그래프 요약 요청 접수 자체가 실패했음 */
  GRAPH_SUMMARY_REQUEST_FAILED: 'GRAPH_SUMMARY_REQUEST_FAILED',
  /** AI Worker가 그래프 요약 생성을 완료했음 */
  GRAPH_SUMMARY_COMPLETED: 'GRAPH_SUMMARY_COMPLETED',
  /** AI Worker의 그래프 요약 생성 중 오류 발생 */
  GRAPH_SUMMARY_FAILED: 'GRAPH_SUMMARY_FAILED',

  // ── 대화 추가(Add Node) 관련 ───────────────────────────────────────────────
  /** 대화 추가 요청이 서버에 정상 접수되었음 */
  ADD_CONVERSATION_REQUESTED: 'ADD_CONVERSATION_REQUESTED',
  /** 대화 추가 요청 접수 자체가 실패했음 */
  ADD_CONVERSATION_REQUEST_FAILED: 'ADD_CONVERSATION_REQUEST_FAILED',
  /** 새 대화(들)이 기존 그래프에 성공적으로 추가되었음 */
  ADD_CONVERSATION_COMPLETED: 'ADD_CONVERSATION_COMPLETED',
  /** 새 대화 추가 작업 중 오류 발생 */
  ADD_CONVERSATION_FAILED: 'ADD_CONVERSATION_FAILED',

  // ── Microscope 문서 분석 관련 ─────────────────────────────────────────────
  /** Microscope Ingest 요청이 서버에 정상 접수되었음 */
  MICROSCOPE_INGEST_REQUESTED: 'MICROSCOPE_INGEST_REQUESTED',
  /** Microscope Ingest 요청 접수 자체가 실패했음 */
  MICROSCOPE_INGEST_REQUEST_FAILED: 'MICROSCOPE_INGEST_REQUEST_FAILED',
  /** 단일 문서 분석(Ingest)이 완료되었음 */
  MICROSCOPE_DOCUMENT_COMPLETED: 'MICROSCOPE_DOCUMENT_COMPLETED',
  /** 단일 문서 분석 중 오류 발생 */
  MICROSCOPE_DOCUMENT_FAILED: 'MICROSCOPE_DOCUMENT_FAILED',
  /** 워크스페이스 내 전체 문서 Ingest가 완료되었음 */
  MICROSCOPE_WORKSPACE_COMPLETED: 'MICROSCOPE_WORKSPACE_COMPLETED',
} as const;

/**
 * `NotificationType`의 값 유니온 타입
 *
 * @example
 * function handleNotification(type: NotificationTypeValue) { ... }
 */
export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

// ─────────────────────────────────────────────────────────────────────────────
// Notification Payload 타입 (각 이벤트가 전달하는 데이터)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 모든 알림 이벤트가 공통으로 포함하는 필드
 * @public
 */
export interface BaseNotificationPayload {
  /** 작업 고유 ID (Correlation ID) — 요청 시 받은 taskId와 동일 */
  taskId: string;
  /** 이벤트 발생 시각 (ISO 8601) */
  timestamp: string;
}

/**
 * `GRAPH_GENERATION_REQUESTED` 이벤트 페이로드
 * @public
 */
export interface GraphGenerationRequestedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_GENERATION_REQUEST_FAILED` 이벤트 페이로드
 * @public
 */
export interface GraphGenerationRequestFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `GRAPH_GENERATION_COMPLETED` 이벤트 페이로드
 * @public
 */
export interface GraphGenerationCompletedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_GENERATION_FAILED` 이벤트 페이로드
 * @public
 */
export interface GraphGenerationFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `GRAPH_SUMMARY_REQUESTED` 이벤트 페이로드
 * @public
 */
export interface GraphSummaryRequestedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_SUMMARY_REQUEST_FAILED` 이벤트 페이로드
 * @public
 */
export interface GraphSummaryRequestFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `GRAPH_SUMMARY_COMPLETED` 이벤트 페이로드
 * @public
 */
export interface GraphSummaryCompletedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_SUMMARY_FAILED` 이벤트 페이로드
 * @public
 */
export interface GraphSummaryFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `ADD_CONVERSATION_REQUESTED` 이벤트 페이로드
 * @public
 */
export interface AddConversationRequestedPayload extends BaseNotificationPayload {}

/**
 * `ADD_CONVERSATION_REQUEST_FAILED` 이벤트 페이로드
 * @public
 */
export interface AddConversationRequestFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `ADD_CONVERSATION_COMPLETED` 이벤트 페이로드
 * @public
 */
export interface AddConversationCompletedPayload extends BaseNotificationPayload {
  /** 새로 추가된 노드 수 */
  nodeCount: number;
  /** 새로 추가된 엣지 수 */
  edgeCount: number;
}

/**
 * `ADD_CONVERSATION_FAILED` 이벤트 페이로드
 * @public
 */
export interface AddConversationFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `MICROSCOPE_INGEST_REQUESTED` 이벤트 페이로드
 * @public
 */
export interface MicroscopeIngestRequestedPayload extends BaseNotificationPayload {}

/**
 * `MICROSCOPE_INGEST_REQUEST_FAILED` 이벤트 페이로드
 * @public
 */
export interface MicroscopeIngestRequestFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `MICROSCOPE_DOCUMENT_COMPLETED` 이벤트 페이로드
 * @public
 */
export interface MicroscopeDocumentCompletedPayload extends BaseNotificationPayload {
  /** 분석이 완료된 문서의 소스 노드 ID (Neo4j) */
  sourceId?: string;
  /** 문서에서 추출된 청크 수 */
  chunksCount?: number;
}

/**
 * `MICROSCOPE_DOCUMENT_FAILED` 이벤트 페이로드
 * @public
 */
export interface MicroscopeDocumentFailedPayload extends BaseNotificationPayload {
  /** 실패 원인 메시지 */
  error: string;
}

/**
 * `MICROSCOPE_WORKSPACE_COMPLETED` 이벤트 페이로드
 * @public
 */
export interface MicroscopeWorkspaceCompletedPayload extends BaseNotificationPayload {}

/**
 * 서버에서 수신되는 알림 이벤트 래퍼 타입
 *
 * @description
 * `client.notification.stream()` 콜백의 첫 번째 인자입니다.
 * `type`으로 이벤트를 식별하고, `payload`에 상세 데이터가 담겨 있습니다.
 *
 * @public
 *
 * @example
 * ```typescript
 * const close = client.notification.stream((event: NotificationEvent) => {
 *   if (event.type === NotificationType.ADD_CONVERSATION_COMPLETED) {
 *     console.log(`노드 ${event.payload.nodeCount}개 추가 완료`);
 *   }
 * });
 * ```
 */
export interface NotificationEvent {
  /** 이벤트 종류 (@see NotificationTypeValue) */
  type: NotificationTypeValue;
  /** 이벤트별 상세 데이터 */
  payload: Record<string, unknown>;
}
