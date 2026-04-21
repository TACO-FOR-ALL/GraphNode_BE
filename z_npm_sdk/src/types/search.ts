/**
 * 키워드 검색 결과 노트 항목
 *
 * @remarks
 * content 전문 대신 키워드 주변 snippet만 포함합니다.
 * @public
 */
export interface NoteSearchResult {
  /** 노트 고유 ID */
  id: string;
  /** 노트 제목 */
  title: string;
  /**
   * 키워드 주변 텍스트 조각
   * - content에 키워드가 있으면: 키워드 전후 문맥 (~150자)
   * - 제목에만 키워드가 있으면: content 앞부분 (~150자)
   */
  snippet: string;
  /** 소속 폴더 ID (null = 최상위) */
  folderId: string | null;
  /** 생성 일시 (ISO 8601) */
  createdAt: string;
  /** 수정 일시 (ISO 8601) */
  updatedAt: string;
}

/**
 * 키워드 검색 결과 대화 항목
 *
 * @remarks
 * messages 배열 대신 단일 snippet 문자열만 포함합니다.
 * @public
 */
export interface ConversationSearchResult {
  /** 대화 고유 ID */
  id: string;
  /** 대화 제목 */
  title: string;
  /**
   * 대화 내 키워드 컨텍스트 문자열
   * - 제목에 키워드가 있으면: 마지막 메시지의 첫 문장
   * - 메시지 내용에 키워드가 있으면: 키워드 포함 문장 일부분
   * - 메시지가 없으면: 빈 문자열
   */
  snippet: string;
  /** 생성 일시 (ISO 8601) */
  createdAt: string;
  /** 수정 일시 (ISO 8601) */
  updatedAt: string;
}

/**
 * 노트 및 AI 대화 통합 키워드 검색 응답 타입.
 *
 * @remarks
 * notes와 chatThreads 모두 updatedAt 내림차순(최신 수정순)으로 정렬됩니다.
 * MongoDB `$regex` 기반 검색이므로 score 필드는 포함되지 않습니다.
 * @public
 */
export interface SearchNotesAndAIChatsResponse {
  /** 검색된 노트 목록 (updatedAt 내림차순) */
  notes: NoteSearchResult[];
  /** 검색된 AI 대화 목록 (updatedAt 내림차순) */
  chatThreads: ConversationSearchResult[];
}

/**
 * 노트 및 AI 대화 통합 키워드 검색 요청 파라미터
 * @public
 */
export interface SearchNotesAndAIChatsParams {
  /** 검색할 키워드 */
  q: string;
}
