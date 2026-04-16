/**
 * GraphNode SDK에서 사용하는 알림 및 작업 관련 타입 정의입니다.
 *
 * @module notification
 * @public
 */

// -----------------------------------------------------------------------------
// TaskType
// -----------------------------------------------------------------------------

/**
 * API, 큐, 워커 사이에서 교환되는 비동기 작업 식별자입니다.
 *
 * @public
 */
export enum TaskType {
  GRAPH_GENERATION_REQUEST = 'GRAPH_GENERATION_REQUEST',
  GRAPH_GENERATION_RESULT = 'GRAPH_GENERATION_RESULT',

  GRAPH_SUMMARY_REQUEST = 'GRAPH_SUMMARY_REQUEST',
  GRAPH_SUMMARY_RESULT = 'GRAPH_SUMMARY_RESULT',

  ADD_NODE_REQUEST = 'ADD_NODE_REQUEST',
  ADD_NODE_RESULT = 'ADD_NODE_RESULT',

  MICROSCOPE_INGEST_FROM_NODE_REQUEST = 'MICROSCOPE_INGEST_FROM_NODE_REQUEST',
  MICROSCOPE_INGEST_FROM_NODE_RESULT = 'MICROSCOPE_INGEST_FROM_NODE_RESULT',
}

// -----------------------------------------------------------------------------
// NotificationType
// -----------------------------------------------------------------------------

/**
 * FE가 SSE/WebSocket으로 수신하는 알림 이벤트 종류입니다.
 *
 * @public
 */
export const NotificationType = {
  GRAPH_GENERATION_REQUESTED: 'GRAPH_GENERATION_REQUESTED',
  GRAPH_GENERATION_REQUEST_FAILED: 'GRAPH_GENERATION_REQUEST_FAILED',
  GRAPH_GENERATION_COMPLETED: 'GRAPH_GENERATION_COMPLETED',
  GRAPH_GENERATION_FAILED: 'GRAPH_GENERATION_FAILED',
  GRAPH_GENERATION_PROGRESS_RESULT: 'GRAPH_GENERATION_PROGRESS_RESULT',

  GRAPH_SUMMARY_REQUESTED: 'GRAPH_SUMMARY_REQUESTED',
  GRAPH_SUMMARY_REQUEST_FAILED: 'GRAPH_SUMMARY_REQUEST_FAILED',
  GRAPH_SUMMARY_COMPLETED: 'GRAPH_SUMMARY_COMPLETED',
  GRAPH_SUMMARY_FAILED: 'GRAPH_SUMMARY_FAILED',

  ADD_CONVERSATION_REQUESTED: 'ADD_CONVERSATION_REQUESTED',
  ADD_CONVERSATION_REQUEST_FAILED: 'ADD_CONVERSATION_REQUEST_FAILED',
  ADD_CONVERSATION_COMPLETED: 'ADD_CONVERSATION_COMPLETED',
  ADD_CONVERSATION_FAILED: 'ADD_CONVERSATION_FAILED',

  MICROSCOPE_INGEST_REQUESTED: 'MICROSCOPE_INGEST_REQUESTED',
  MICROSCOPE_INGEST_REQUEST_FAILED: 'MICROSCOPE_INGEST_REQUEST_FAILED',
  MICROSCOPE_DOCUMENT_COMPLETED: 'MICROSCOPE_DOCUMENT_COMPLETED',
  MICROSCOPE_DOCUMENT_FAILED: 'MICROSCOPE_DOCUMENT_FAILED',
  MICROSCOPE_WORKSPACE_COMPLETED: 'MICROSCOPE_WORKSPACE_COMPLETED',
} as const;

/**
 * `NotificationType`에 정의된 모든 값의 유니온 타입입니다.
 *
 * @example
 * function handleNotification(type: NotificationTypeValue) { ... }
 */
export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

// -----------------------------------------------------------------------------
// Notification payloads
// -----------------------------------------------------------------------------

/**
 * 모든 notification payload가 공통으로 가지는 기본 필드입니다.
 *
 * 모든 payload에는 작업 추적용 `taskId`와 payload 생성 시각이 들어 있습니다.
 * FE는 `taskId`를 사용해 요청 시작 상태, 진행률 이벤트, 최종 완료/실패 이벤트를 연결할 수 있습니다.
 *
 * @public
 */
export interface BaseNotificationPayload {
  /**
   * 원본 비동기 작업의 상관관계 ID입니다.
   *
   * FE에서 다음 상황을 하나의 작업으로 묶어 추적할 때 사용합니다.
   * - 요청 시작 상태
   * - 진행률 알림
   * - 최종 완료/실패 알림
   */
  taskId: string;

  /**
   * notification payload가 생성된 시각입니다.
   *
   * 형식은 ISO 8601 문자열입니다.
   */
  timestamp: string;
}

/**
 * `GRAPH_GENERATION_REQUESTED` 이벤트의 payload입니다.
 *
 * 그래프 생성 요청이 서버에 정상 접수되어 비동기 작업으로 등록되었을 때 내려옵니다.
 * 아직 워커의 실제 생성 작업이 끝난 상태는 아닙니다.
 *
 * FE 활용 예:
 * - "그래프 생성 시작" 토스트 표시
 * - 그래프 생성 작업을 pending 상태로 기록
 * - 이후 progress/completed/failed와 연결하기 위해 `taskId` 보관
 *
 * @public
 */
export interface GraphGenerationRequestedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_GENERATION_REQUEST_FAILED` 이벤트의 payload입니다.
 *
 * 요청이 큐에 등록되거나 유효한 비동기 작업으로 받아들여지지 못했을 때 내려옵니다.
 * 즉, 정상적인 워커 실행 이전 단계에서 실패한 경우입니다.
 *
 * FE 활용 예:
 * - 로딩 상태 즉시 종료
 * - 요청/검증/시스템 오류 메시지 노출
 *
 * @public
 */
export interface GraphGenerationRequestFailedPayload extends BaseNotificationPayload {
  /** 요청 접수 실패 원인을 설명하는 사람이 읽을 수 있는 오류 메시지입니다. */
  error: string;
}

/**
 * `GRAPH_GENERATION_COMPLETED` 이벤트의 payload입니다.
 *
 * 그래프 생성이 성공적으로 끝났고, FE가 그래프 데이터를 새로고침해도 되는 상태일 때 내려옵니다.
 *
 * FE 활용 예:
 * - 그래프 스냅샷 재조회
 * - 그래프 관련 캐시 무효화
 * - 추적 중이던 작업의 로딩 UI 종료
 *
 * @public
 */
export interface GraphGenerationCompletedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_GENERATION_FAILED` 이벤트의 payload입니다.
 *
 * 워커의 그래프 생성 작업 또는 후속 저장 단계가 실패했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - pending/progress UI 종료
 * - 실패 토스트 또는 재시도 진입점 노출
 *
 * @public
 */
export interface GraphGenerationFailedPayload extends BaseNotificationPayload {
  /** 그래프 생성 작업 실패 사유를 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `GRAPH_GENERATION_PROGRESS_RESULT` 이벤트의 payload입니다.
 *
 * 그래프 생성이 아직 진행 중일 때 중간 진행 상황을 알리기 위해 내려오는 이벤트입니다.
 * 최종 완료 이벤트는 아니므로, 이후 completed 또는 failed가 추가로 올 수 있습니다.
 *
 * FE 활용 예:
 * - 진행률 바 표시
 * - 현재 단계 라벨 표시
 * - 오래 걸리는 작업이 진행 중임을 사용자에게 유지 표시
 *
 * @public
 */
export interface GraphGenerationProgressPayload extends BaseNotificationPayload {
  /** 해당 생성 작업과 연결된 사용자 식별자입니다. */
  userId: string;

  /** 백엔드가 정의한 현재 완료 단계 이름입니다. */
  completedStage: string;

  /** 백엔드가 내려주는 진행률 퍼센트 값입니다. 일반적으로 0~100 범위를 기대합니다. */
  progressPercent: number;
}

/**
 * `GRAPH_SUMMARY_REQUESTED` 이벤트의 payload입니다.
 *
 * 그래프 요약 생성 요청이 정상 접수되었을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 요약 생성 pending 상태 표시
 * - 이후 completed/failed와 `taskId` 기준으로 연결
 *
 * @public
 */
export interface GraphSummaryRequestedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_SUMMARY_REQUEST_FAILED` 이벤트의 payload입니다.
 *
 * 그래프 요약 요청이 접수되거나 큐에 등록되지 못했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 요약 생성 로딩 상태 즉시 해제
 * - 요청 단계 실패 원인 표시
 *
 * @public
 */
export interface GraphSummaryRequestFailedPayload extends BaseNotificationPayload {
  /** 요청 접수 실패 원인을 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `GRAPH_SUMMARY_COMPLETED` 이벤트의 payload입니다.
 *
 * 그래프 요약 생성 작업이 성공적으로 완료되었을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 요약 데이터 재조회
 * - 요약 패널 상태를 pending에서 ready로 전환
 *
 * @public
 */
export interface GraphSummaryCompletedPayload extends BaseNotificationPayload {}

/**
 * `GRAPH_SUMMARY_FAILED` 이벤트의 payload입니다.
 *
 * 요약 생성 작업이 접수된 이후 실행 단계에서 실패했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 요약 스피너 종료
 * - 재시도 UI 노출
 *
 * @public
 */
export interface GraphSummaryFailedPayload extends BaseNotificationPayload {
  /** 요약 생성 실패 사유를 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `ADD_CONVERSATION_REQUESTED` 이벤트의 payload입니다.
 *
 * 새 대화를 그래프에 반영하는 요청이 정상 접수되었을 때 내려옵니다.
 *
 * FE 활용 예:
 * - "대화를 그래프에 반영 중" 상태 유지
 * - `taskId` 기반으로 비동기 작업 추적
 *
 * @public
 */
export interface AddConversationRequestedPayload extends BaseNotificationPayload {}

/**
 * `ADD_CONVERSATION_REQUEST_FAILED` 이벤트의 payload입니다.
 *
 * 새 대화 반영 작업이 접수되거나 큐에 등록되지 못했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 로컬 pending 상태 해제
 * - 그래프 업데이트를 시작하지 못한 이유 설명
 *
 * @public
 */
export interface AddConversationRequestFailedPayload extends BaseNotificationPayload {
  /** 요청 접수 실패 원인을 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `ADD_CONVERSATION_COMPLETED` 이벤트의 payload입니다.
 *
 * 새 대화가 처리되어 그래프 엔티티가 실제로 추가된 뒤 내려옵니다.
 *
 * FE 활용 예:
 * - 그래프 새로고침
 * - 추가된 노드/엣지 수 표시
 * - 새 대화로 인해 그래프가 얼마나 확장되었는지 강조
 *
 * @public
 */
export interface AddConversationCompletedPayload extends BaseNotificationPayload {
  /** 완료된 작업으로 인해 추가되거나 생성된 그래프 노드 수입니다. */
  nodeCount: number;

  /** 완료된 작업으로 인해 추가되거나 생성된 그래프 엣지 수입니다. */
  edgeCount: number;
}

/**
 * `ADD_CONVERSATION_FAILED` 이벤트의 payload입니다.
 *
 * 대화를 그래프에 반영하는 작업이 접수 이후 실행 단계에서 실패했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 대화 import의 pending 상태 해제
 * - 재시도 또는 상세 오류 노출
 *
 * @public
 */
export interface AddConversationFailedPayload extends BaseNotificationPayload {
  /** 대화 반영 작업 실패 사유를 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `MICROSCOPE_INGEST_REQUESTED` 이벤트의 payload입니다.
 *
 * Microscope ingest 요청이 정상 접수되었을 때 내려옵니다.
 *
 * FE 활용 예:
 * - ingest가 대기/실행 중임을 표시
 * - `taskId`로 ingest 작업 추적
 *
 * @public
 */
export interface MicroscopeIngestRequestedPayload extends BaseNotificationPayload {}

/**
 * `MICROSCOPE_INGEST_REQUEST_FAILED` 이벤트의 payload입니다.
 *
 * ingest 요청이 접수되거나 큐에 등록되지 못했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - ingest 로딩 상태 즉시 종료
 * - 실행 이전 단계 실패 원인 표시
 *
 * @public
 */
export interface MicroscopeIngestRequestFailedPayload extends BaseNotificationPayload {
  /** 요청 접수 실패 원인을 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `MICROSCOPE_DOCUMENT_COMPLETED` 이벤트의 payload입니다.
 *
 * 단일 문서 ingest가 성공적으로 완료되었을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 문서별 ingest 진행 목록 갱신
 * - 생성된 source/node로 이동
 * - chunking 결과 표시
 *
 * @public
 */
export interface MicroscopeDocumentCompletedPayload extends BaseNotificationPayload {
  /** 생성되거나 갱신된 ingest 대상 source/document 엔티티의 식별자입니다. */
  sourceId?: string;

  /** 문서에서 생성된 청크 수입니다. 제공되는 경우에만 내려옵니다. */
  chunksCount?: number;
}

/**
 * `MICROSCOPE_DOCUMENT_FAILED` 이벤트의 payload입니다.
 *
 * 단일 문서 ingest가 접수 이후 실행 단계에서 실패했을 때 내려옵니다.
 *
 * FE 활용 예:
 * - 문서 행 또는 아이템을 실패 상태로 표시
 * - 해당 문서만 재시도하는 UI 제공
 *
 * @public
 */
export interface MicroscopeDocumentFailedPayload extends BaseNotificationPayload {
  /** 문서 ingest 실패 사유를 설명하는 오류 메시지입니다. */
  error: string;
}

/**
 * `MICROSCOPE_WORKSPACE_COMPLETED` 이벤트의 payload입니다.
 *
 * 워크스페이스 단위 ingest 흐름이 완료되었을 때 내려옵니다.
 * 문서 단위 완료와 달리, 더 넓은 배치 처리나 워크스페이스 집계 단계 종료를 의미하는 경우가 많습니다.
 *
 * FE 활용 예:
 * - 전역 workspace ingest 진행 UI 종료
 * - workspace 단위 데이터 새로고침
 *
 * @public
 */
export interface MicroscopeWorkspaceCompletedPayload extends BaseNotificationPayload {}

// -----------------------------------------------------------------------------
// Generic and raw notification events
// -----------------------------------------------------------------------------

/**
 * 백엔드 스트림에서 내려오는 원시 notification event 형태입니다.
 *
 * 이 타입은 의도적으로 느슨하게 정의되어 있습니다.
 * FE에서 `event.type` 분기만으로 `payload` 타입을 자동 좁히고 싶다면 `TypedNotificationEvent` 사용을 권장합니다.
 *
 * @public
 */
export interface NotificationEvent {
  /** notification event 자체의 고유 ID입니다. 스트림 재개 또는 중복 제거에 사용할 수 있습니다. */
  id: string;

  /** notification 종류 식별자입니다. */
  type: NotificationTypeValue;

  /** 컴파일 타임 좁히기가 적용되지 않은 원시 payload 객체입니다. */
  payload: Record<string, unknown>;

  /** 이벤트 envelope 생성 시각입니다. 형식은 ISO 8601 문자열입니다. */
  timestamp: string;
}

/**
 * `NotificationType`와 payload 타입을 연결하는 매핑 테이블입니다.
 *
 * @public
 */
export interface NotificationPayloadMap {
  [NotificationType.GRAPH_GENERATION_REQUESTED]: GraphGenerationRequestedPayload;
  [NotificationType.GRAPH_GENERATION_REQUEST_FAILED]: GraphGenerationRequestFailedPayload;
  [NotificationType.GRAPH_GENERATION_COMPLETED]: GraphGenerationCompletedPayload;
  [NotificationType.GRAPH_GENERATION_FAILED]: GraphGenerationFailedPayload;
  [NotificationType.GRAPH_GENERATION_PROGRESS_RESULT]: GraphGenerationProgressPayload;
  [NotificationType.GRAPH_SUMMARY_REQUESTED]: GraphSummaryRequestedPayload;
  [NotificationType.GRAPH_SUMMARY_REQUEST_FAILED]: GraphSummaryRequestFailedPayload;
  [NotificationType.GRAPH_SUMMARY_COMPLETED]: GraphSummaryCompletedPayload;
  [NotificationType.GRAPH_SUMMARY_FAILED]: GraphSummaryFailedPayload;
  [NotificationType.ADD_CONVERSATION_REQUESTED]: AddConversationRequestedPayload;
  [NotificationType.ADD_CONVERSATION_REQUEST_FAILED]: AddConversationRequestFailedPayload;
  [NotificationType.ADD_CONVERSATION_COMPLETED]: AddConversationCompletedPayload;
  [NotificationType.ADD_CONVERSATION_FAILED]: AddConversationFailedPayload;
  [NotificationType.MICROSCOPE_INGEST_REQUESTED]: MicroscopeIngestRequestedPayload;
  [NotificationType.MICROSCOPE_INGEST_REQUEST_FAILED]: MicroscopeIngestRequestFailedPayload;
  [NotificationType.MICROSCOPE_DOCUMENT_COMPLETED]: MicroscopeDocumentCompletedPayload;
  [NotificationType.MICROSCOPE_DOCUMENT_FAILED]: MicroscopeDocumentFailedPayload;
  [NotificationType.MICROSCOPE_WORKSPACE_COMPLETED]: MicroscopeWorkspaceCompletedPayload;
}

/**
 * `type`에 맞는 `payload`가 연결된 기본 완성형 notification event 타입입니다.
 *
 * 아래의 개별 이벤트 interface들이 이 제네릭 타입을 기반으로 만들어집니다.
 * FE에서는 보통 이 타입을 직접 쓰기보다 `TypedNotificationEvent`를 사용하는 편이 더 편합니다.
 *
 * @public
 */
export interface TypedNotificationEventBase<TType extends NotificationTypeValue>
  extends Omit<NotificationEvent, 'type' | 'payload'> {
  /** 구체적인 notification type 리터럴 값입니다. */
  type: TType;

  /** 위 `type` 값에 자동으로 매칭된 payload 타입입니다. */
  payload: NotificationPayloadMap[TType];
}

// -----------------------------------------------------------------------------
// Fully typed notification events per NotificationType
// -----------------------------------------------------------------------------

/**
 * `GRAPH_GENERATION_REQUESTED` 전용 완성형 event 타입입니다.
 *
 * 그래프 생성이 시작되었음을 처리하는 FE 로직에 사용합니다.
 *
 * @public
 */
export interface GraphGenerationRequestedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_GENERATION_REQUESTED> {}

/**
 * `GRAPH_GENERATION_REQUEST_FAILED` 전용 완성형 event 타입입니다.
 *
 * 그래프 생성 작업이 실제 실행 전에 실패한 경우를 처리할 때 사용합니다.
 *
 * @public
 */
export interface GraphGenerationRequestFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_GENERATION_REQUEST_FAILED> {}

/**
 * `GRAPH_GENERATION_COMPLETED` 전용 완성형 event 타입입니다.
 *
 * 그래프 생성 완료 후 FE가 데이터를 다시 불러와야 할 때 사용합니다.
 *
 * @public
 */
export interface GraphGenerationCompletedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_GENERATION_COMPLETED> {}

/**
 * `GRAPH_GENERATION_FAILED` 전용 완성형 event 타입입니다.
 *
 * 그래프 생성 실행 실패를 처리하고 UI를 종료할 때 사용합니다.
 *
 * @public
 */
export interface GraphGenerationFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_GENERATION_FAILED> {}

/**
 * `GRAPH_GENERATION_PROGRESS_RESULT` 전용 완성형 event 타입입니다.
 *
 * 단계형 또는 퍼센트 기반 진행률 UI를 표시할 때 사용합니다.
 *
 * @public
 */
export interface GraphGenerationProgressNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_GENERATION_PROGRESS_RESULT> {}

/**
 * `GRAPH_SUMMARY_REQUESTED` 전용 완성형 event 타입입니다.
 *
 * 요약 생성 시작 상태를 FE에서 추적할 때 사용합니다.
 *
 * @public
 */
export interface GraphSummaryRequestedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_SUMMARY_REQUESTED> {}

/**
 * `GRAPH_SUMMARY_REQUEST_FAILED` 전용 완성형 event 타입입니다.
 *
 * 요약 생성이 비동기 처리에 들어가지 못한 실패를 다룰 때 사용합니다.
 *
 * @public
 */
export interface GraphSummaryRequestFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_SUMMARY_REQUEST_FAILED> {}

/**
 * `GRAPH_SUMMARY_COMPLETED` 전용 완성형 event 타입입니다.
 *
 * 생성된 요약을 다시 불러오거나 표시할 때 사용합니다.
 *
 * @public
 */
export interface GraphSummaryCompletedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_SUMMARY_COMPLETED> {}

/**
 * `GRAPH_SUMMARY_FAILED` 전용 완성형 event 타입입니다.
 *
 * 요약 생성 실패 후 로딩 상태를 정리하고 재시도 UI를 노출할 때 사용합니다.
 *
 * @public
 */
export interface GraphSummaryFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.GRAPH_SUMMARY_FAILED> {}

/**
 * `ADD_CONVERSATION_REQUESTED` 전용 완성형 event 타입입니다.
 *
 * 새 대화를 그래프에 반영하는 작업 시작 상태를 표시할 때 사용합니다.
 *
 * @public
 */
export interface AddConversationRequestedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.ADD_CONVERSATION_REQUESTED> {}

/**
 * `ADD_CONVERSATION_REQUEST_FAILED` 전용 완성형 event 타입입니다.
 *
 * 대화-그래프 동기화가 시작되지 못한 경우를 처리할 때 사용합니다.
 *
 * @public
 */
export interface AddConversationRequestFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.ADD_CONVERSATION_REQUEST_FAILED> {}

/**
 * `ADD_CONVERSATION_COMPLETED` 전용 완성형 event 타입입니다.
 *
 * 동기화 완료 후 추가된 그래프 엔티티 수를 FE에서 활용할 때 사용합니다.
 *
 * @public
 */
export interface AddConversationCompletedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.ADD_CONVERSATION_COMPLETED> {}

/**
 * `ADD_CONVERSATION_FAILED` 전용 완성형 event 타입입니다.
 *
 * 대화 그래프 반영 실패 시 pending UI를 정리하고 오류를 보여줄 때 사용합니다.
 *
 * @public
 */
export interface AddConversationFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.ADD_CONVERSATION_FAILED> {}

/**
 * `MICROSCOPE_INGEST_REQUESTED` 전용 완성형 event 타입입니다.
 *
 * Microscope ingest 시작 상태를 FE에서 추적할 때 사용합니다.
 *
 * @public
 */
export interface MicroscopeIngestRequestedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.MICROSCOPE_INGEST_REQUESTED> {}

/**
 * `MICROSCOPE_INGEST_REQUEST_FAILED` 전용 완성형 event 타입입니다.
 *
 * ingest가 정상 실행에 들어가기 전 실패한 경우를 처리할 때 사용합니다.
 *
 * @public
 */
export interface MicroscopeIngestRequestFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.MICROSCOPE_INGEST_REQUEST_FAILED> {}

/**
 * `MICROSCOPE_DOCUMENT_COMPLETED` 전용 완성형 event 타입입니다.
 *
 * 큰 ingest 흐름 안에서 문서 단위 성공 이벤트를 다룰 때 사용합니다.
 *
 * @public
 */
export interface MicroscopeDocumentCompletedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.MICROSCOPE_DOCUMENT_COMPLETED> {}

/**
 * `MICROSCOPE_DOCUMENT_FAILED` 전용 완성형 event 타입입니다.
 *
 * 문서 단위 ingest 실패를 타입 안전하게 처리할 때 사용합니다.
 *
 * @public
 */
export interface MicroscopeDocumentFailedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.MICROSCOPE_DOCUMENT_FAILED> {}

/**
 * `MICROSCOPE_WORKSPACE_COMPLETED` 전용 완성형 event 타입입니다.
 *
 * 워크스페이스 단위 ingest가 최종 완료되었을 때 처리하는 FE 로직에 사용합니다.
 *
 * @public
 */
export interface MicroscopeWorkspaceCompletedNotificationEvent
  extends TypedNotificationEventBase<typeof NotificationType.MICROSCOPE_WORKSPACE_COMPLETED> {}

/**
 * 모든 완성형 notification event를 합친 discriminated union 타입입니다.
 *
 * FE 스트림 핸들러에서 가장 권장되는 타입입니다.
 * `switch (event.type)`만으로 `event.payload`가 자동으로 좁혀집니다.
 *
 * @public
 */
export type TypedNotificationEvent =
  | GraphGenerationRequestedNotificationEvent
  | GraphGenerationRequestFailedNotificationEvent
  | GraphGenerationCompletedNotificationEvent
  | GraphGenerationFailedNotificationEvent
  | GraphGenerationProgressNotificationEvent
  | GraphSummaryRequestedNotificationEvent
  | GraphSummaryRequestFailedNotificationEvent
  | GraphSummaryCompletedNotificationEvent
  | GraphSummaryFailedNotificationEvent
  | AddConversationRequestedNotificationEvent
  | AddConversationRequestFailedNotificationEvent
  | AddConversationCompletedNotificationEvent
  | AddConversationFailedNotificationEvent
  | MicroscopeIngestRequestedNotificationEvent
  | MicroscopeIngestRequestFailedNotificationEvent
  | MicroscopeDocumentCompletedNotificationEvent
  | MicroscopeDocumentFailedNotificationEvent
  | MicroscopeWorkspaceCompletedNotificationEvent;

/**
 * 특정 `NotificationType`에 대응하는 완성형 event 타입만 추출하는 유틸리티 타입입니다.
 *
 * 활용 예:
 * - 이벤트 전용 핸들러 시그니처 정의
 * - 타입 가드 작성
 * - 특정 notification 종류에 묶인 FE 유틸리티 작성
 *
 * @public
 */
export type NotificationEventByType<TType extends NotificationTypeValue> = Extract<
  TypedNotificationEvent,
  { type: TType }
>;
