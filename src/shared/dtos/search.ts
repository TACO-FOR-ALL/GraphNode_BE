/**
 * 모듈: 검색 결과 전용 DTO
 *
 * 책임:
 * - 통합 키워드 검색 응답에서 반환되는 데이터 형태를 정의합니다.
 * - Note/ChatThread 전문 DTO와 달리 검색 컨텍스트에 최적화된 최소 필드만 포함합니다.
 *
 * 설계 원칙:
 * - NoteSearchResult: 전체 content 대신 키워드 주변 snippet만 포함합니다.
 * - ConversationSearchResult: messages 배열 대신 단일 snippet 문자열만 포함합니다.
 */

/**
 * 키워드 검색 결과 노트 항목
 *
 * @property id 노트 고유 ID
 * @property title 노트 제목
 * @property snippet 키워드 주변 텍스트 조각 (content 전문 미포함)
 *   - content에 키워드가 있으면: 키워드 전후 문맥 (~150자)
 *   - 제목에만 키워드가 있으면: content 앞부분 (~150자)
 * @property folderId 소속 폴더 ID (null = 최상위)
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 */
export interface NoteSearchResult {
  id: string;
  title: string;
  snippet: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 키워드 검색 결과 대화 항목
 *
 * @property id 대화 고유 ID
 * @property title 대화 제목
 * @property snippet 대화 내 키워드 컨텍스트 문자열
 *   - 제목에 키워드가 있으면: 마지막 메시지의 첫 문장
 *   - 메시지 내용에 키워드가 있으면: 키워드 포함 문장 일부분
 *   - 메시지가 없으면: 빈 문자열
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 */
export interface ConversationSearchResult {
  id: string;
  title: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 통합 키워드 검색 응답 DTO
 *
 * notes와 chatThreads 모두 updatedAt 내림차순(최신 수정순)으로 정렬됩니다.
 */
export interface SearchResult {
  notes: NoteSearchResult[];
  chatThreads: ConversationSearchResult[];
}
