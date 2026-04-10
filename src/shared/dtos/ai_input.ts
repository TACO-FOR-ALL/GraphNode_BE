/**
 * AI 모듈에서
 */
export interface AiInputMessageContent {
  content_type: 'text';
  parts: string[];
}

/**
 * AI 모듈에서 사용되는 입력 양식 중 작성자 정보
 * 작성자의 역할을 나타냅니다.
 * 'role' 필드는 'user', 'assistant', 'system' 중 하나의 값을 가질 수 있습니다.
 * - 'user': 사용자가 보낸 메시지
 * - 'assistant': AI 어시스턴트가 생성한 메시지
 * - 'system': 시스템 메시지 또는 지침
 * @property role - 작성자의 역할
 */
export interface AiInputMessageAuthor {
  role: 'user' | 'assistant' | 'system';
}

/**
 * AI 모듈에서 Input 메시지 형식
 * AI 서버에 전송되는 메시지의 구조를 정의합니다.
 * - id: 메시지의 고유 식별자
 * - author: 메시지를 작성한 작성자 정보
 * - content: 메시지의 실제 내용
 * @property id - 메시지의 고유 식별자
 * @property author - 메시지를 작성한 작성자 정보
 * @property content - 메시지의 실제 내용
 */
export interface AiInputMessage {
  id: string;
  author: AiInputMessageAuthor;
  content: AiInputMessageContent;
}

/**
 * AI 모듈에서 사용되는 매핑 노드 형식
 * 대화 내의 각 메시지를 트리 구조로 표현합니다.
 * - id: 노드의 고유 식별자
 * - message: 해당 노드에 연결된 메시지 정보
 * - parent: 부모 노드의 식별자 (없을 경우 null)
 * - children: 자식 노드들의 식별자 배열
 * @property id - 노드의 고유 식별자
 * @property message - 해당 노드에 연결된 메시지 정보
 * @property parent - 부모 노드의 식별자 (없을 경우 null)
 * @property children - 자식 노드들의 식별자 배열
 */
export interface AiInputMappingNode {
  id: string;
  message: AiInputMessage | null;
  parent: string | null;
  children: string[];
}

/**
 * AI 모듈에서 사용되는 개별 대화(Conversation) 형식.
 * 이 구조는 AI 모듈(worker.py, add_node/call.py 등) 측에서 S3에 업로드된
 * 전체 대화 정보(메시지 매핑, 생성 시간)를 읽어들일 때 사용합니다.
 * 
 * @property id - 대화의 고유 ID
 * @property conversation_id - (Legacy) AI 측 파이썬 로직 하위호환을 위한 스네이크 케이스 ID
 * @property conversationId - (AddNode) 신규 AddNode 파이프라인에서 이용하는 카멜 케이스 ID
 * @property title - 대화의 제목
 * @property create_time - 대화 생성 시간 (Unix 타임스탬프, 초 단위)
 * @property update_time - 대화 마지막 업데이트 시간 (Unix 타임스탬프, 초 단위)
 * @property mapping - 메시지 매핑 정보 트리 (노드 ID를 키로 하는 매핑 노드 객체)
 */
export interface AiInputConversation {
  id: string;
  conversation_id: string; // Legacy Python tasks usage
  conversationId: string;  // AddNode Python task usage
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, AiInputMappingNode>;
}

export type AiInputData = AiInputConversation[];

/**
 * AddNode 배치 처리 시 노트 한 건을 AI에 전달하는 입력 형식.
 * 마크다운 content를 그대로 전달하며, AI는 섹션 단위로 분할하여 처리합니다.
 *
 * @property noteId - 원본 노트의 MongoDB `_id` (예: UUID 문자열)
 * @property title - 노트 제목
 * @property content - 노트 전체 내용 (Markdown 형식)
 */
export interface AiInputNote {
  /** 원본 노트의 MongoDB _id */
  noteId: string;
  /** 노트 제목 */
  title: string;
  /** 노트 전체 내용 (Markdown) */
  content: string;
}

/**
 * AddNode 배치 처리를 위해 AI 큐(.py)에 전송하기 전 S3에 저장하는 Payload/JSON 양식.
 *
 * @property userId - 사용자 식별자 (UUID / ULID)
 * @property existingClusters - 현재 사용자가 보유한 기존 클러스터 정보 리스트 (clusterId, name, themes 등).
 * @property conversations - 새롭게 추가 또는 갱신된 대화의 내용 배열. `mapping` 형식 또는 `messages[]` 형식 모두 허용.
 * @property notes - 새롭게 추가 또는 갱신된 노트의 내용 배열.
 */
export interface AiAddNodeBatchRequest {
  userId: string;
  existingClusters: any[];
  conversations: AiInputConversation[];
  notes: AiInputSourceNode[];
}

/**
 * AI 서버 측 Microscope (RAG/문서 섭취)를 위한 Ingest 요청 DTO 형식입니다.
 * SQS 메시지를 통해 이 양식으로 전달되면 AI의 `handle_microscope_ingest`가 실행됩니다.
 * 
 * @property user_id - 사용자 식별자
 * @property group_id - 그룹 식별자 (마이크로스코프 공간 논리적 구분)
 * @property s3_key - S3에 업로드된 대상 파일(PDF, MD, TXT 등)의 객체 키
 * @property bucket - 대상 파일이 저장된 S3 버킷명
 * @property file_name - 확장자를 포함한 원본 파일명 (예: document.pdf)
 * @property schema_name - 엔티티 추출에 사용할 온톨로지 스키마 이름 (옵션)
 */
export interface AiMicroscopeIngestRequest {
  user_id: string;
  group_id: string;
  s3_key: string;
  bucket: string;
  file_name: string;
  schema_name?: string;
  provider?: string;
  model?: string;
  api_key?: string;
}


/**
 * AI 파이프라인의 개별 섹션(텍스트 조각) 형식.
 * 하나의 노드는 여러 섹션으로 구성될 수 있습니다.
 */
export interface AiInputSection {
  /** 섹션 식별자 */
  id: string;
  /** 섹션 본문 내용 */
  content: string;
  /** 역할 (chat의 경우 user/assistant, 그 외 생략 가능) */
  role?: string;
  /** 섹션 제목 (마크다운 헤더 등) */
  section_title?: string;
}

/**
 * AI 파이프라인의 핵심 입력 단위인 소스 노드 형식.
 * 하나의 노트나 하나의 대화가 하나의 SourceNode가 됩니다.
 */
export interface AiInputSourceNode {
  /** 원본 데이터 식별자 (MongoDB _id) */
  id: string;
  /** 제목 */
  title?: string;
  /** 구성 섹션 리스트 */
  sections: AiInputSection[];
  /** 소스 유형 */
  source_type: 'chat' | 'markdown' | 'notion';
  /** 생성 시간 (Unix Timestamp, seconds) */
  create_time?: number;
  /** 수정 시간 (Unix Timestamp, seconds) */
  update_time?: number;
}

/**
 * AI 서버에 전달할 최종 Payload 형식.
 * 'source_nodes' 키를 최상위에 두어 AI 서버가 개별 노드들을 정확히 인식하게 합니다.
 */
export interface AiInputSourceNodesPayload {
  source_nodes: AiInputSourceNode[];
}
