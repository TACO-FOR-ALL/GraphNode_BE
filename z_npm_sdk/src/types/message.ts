/**
 * 첨부파일 DTO
 * @public
 * @property id 파일 고유 ID (UUID)
 * @property type 파일 종류 ('image' | 'file')
 * @property url S3 오브젝트 키 — `client.ai.downloadFile(url)`로 실제 Blob 다운로드
 * @property name 파일명
 * @property mimeType MIME 타입 (예: 'image/png')
 * @property size 파일 크기(bytes). 서버가 0으로 설정한 경우 다운로드 후 Blob.size 확인
 */
export interface Attachment {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GraphNode AI tool 호출 결과 (web_search, image_generation, web_scraper 등)
 * @public
 */
export interface GraphNodeToolCall {
  /** tool 식별자. 'web_search' | 'image_generation' | 'web_scraper' 등 */
  toolName: string;
  /** tool에 전달된 입력 인수 */
  input: Record<string, unknown>;
  /** 실행 결과 요약 (로깅·UI 표시용) */
  summary?: string;
}

/**
 * Legacy: OpenAI Assistants API code_interpreter / file_search 결과
 * @public
 * @deprecated GraphNode 자체 Tool Calling(GraphNodeToolCall)으로 대체됨.
 *   새 코드에서는 toolName 필드로 분기하세요. 하위 호환을 위해 유지됩니다.
 */
export interface LegacyAssistantToolCall {
  /** @deprecated 'toolName' 필드 사용 권장 */
  type: 'code_interpreter' | 'file_search';
  input?: string;
  logs?: string;
  citations?: any[];
  [key: string]: any;
}

/**
 * 웹 검색 결과 항목
 * @public
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 메시지 메타데이터
 *
 * @remarks
 * 모든 필드는 Optional입니다. FE가 metadata를 처리하지 않아도 런타임 에러가 발생하지 않습니다.
 *
 * ### tool 타입 구별 방법
 * ```ts
 * for (const call of message.metadata?.toolCalls ?? []) {
 *   if ('toolName' in call) {
 *     // GraphNodeToolCall: web_search, image_generation, web_scraper
 *     console.log(call.toolName, call.summary);
 *   } else {
 *     // LegacyAssistantToolCall: code_interpreter, file_search (deprecated)
 *     console.log(call.type, call.logs);
 *   }
 * }
 * ```
 *
 * ### 웹 검색 결과 접근
 * ```ts
 * const results = message.metadata?.searchResults ?? [];
 * results.forEach(r => console.log(r.title, r.url, r.snippet));
 * ```
 *
 * ### 이미지 첨부파일 다운로드
 * ```ts
 * const img = message.attachments?.find(a => a.type === 'image');
 * if (img) {
 *   const blob = await client.ai.downloadFile(img.url);
 *   const objectUrl = URL.createObjectURL(blob);
 * }
 * ```
 * @public
 */
export interface MessageMetadata {
  /**
   * AI tool 호출 기록.
   *
   * 두 형태의 union입니다:
   * - `GraphNodeToolCall`: `toolName` 필드로 식별 (현재 사용 중)
   * - `LegacyAssistantToolCall`: `type` 필드로 식별 (deprecated, 하위 호환용)
   */
  toolCalls?: (GraphNodeToolCall | LegacyAssistantToolCall)[];
  /**
   * web_search tool 실행 시 수집된 검색 결과 목록.
   * toolCalls 중 toolName === 'web_search'인 항목이 있을 때만 포함됩니다.
   */
  searchResults?: SearchResult[];
  /** 확장 필드 — 미래 tool 결과 수용용 */
  [key: string]: any;
}

/**
 * 메시지(Message) DTO
 *
 * @remarks
 * `metadata` 및 `attachments`를 포함한 모든 확장 필드는 Optional입니다.
 * FE가 이 필드들을 처리하지 않아도 기존 동작(`id`, `role`, `content` 처리)에는
 * 영향이 없습니다. 하위 호환성이 완전히 보장됩니다.
 *
 * @public
 * @property id 메시지 ID (UUID/ULID, FE 생성)
 * @property role 메시지 역할 ('user' | 'assistant' | 'system')
 * @property content 메시지 본문
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 * @property deletedAt 삭제 일시 (ISO 8601, null이면 활성)
 * @property attachments AI가 생성·업로드한 파일 목록 (이미지 등)
 * @property score 검색 관련도 점수 (MongoDB textScore 기반, 검색 결과에서만 포함)
 * @property metadata AI tool 호출 결과 및 검색 데이터 (선택)
 */
export interface MessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  attachments?: Attachment[];
  /** 검색 관련도 점수 (MongoDB textScore 기반, 검색 결과에서만 포함) */
  score?: number;
  metadata?: MessageMetadata;
}

/**
 * 메시지 생성 요청 DTO
 * @public
 * @property id 메시지 ID (선택, 클라이언트 생성 시)
 * @property role 메시지 역할
 * @property content 메시지 내용
 */
export interface MessageCreateDto {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 메시지 수정 요청 DTO
 * @public
 * @property content 변경할 메시지 내용 (선택)
 */
export interface MessageUpdateDto {
  content?: string;
}
