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

/**
 * Graph RAG 의미 기반 검색에서 반환되는 단일 그래프 노드 결과입니다.
 *
 * @remarks
 * 백엔드는 벡터 유사도 검색과 Neo4j 이웃 노드 확장을 결합합니다.
 * Seed 노드는 `hopDistance`가 0이고, 그래프 이웃 노드는 1 또는 2입니다.
 * @public
 */
export interface GraphRagNodeResult {
  /** 대화 ID, 노트 ID 같은 원본 문서 ID입니다. */
  origId: string;
  /** 원본 문서에서 해석한 제목입니다. 찾을 수 없으면 null입니다. */
  title: string | null;
  /** `conversation`, `note`, `notion` 같은 원본 노드 유형입니다. */
  nodeType: string;
  /** 그래프 메타데이터에서 해석한 클러스터 이름입니다. 찾을 수 없으면 null입니다. */
  clusterName: string | null;
  /** 벡터 seed 노드로부터의 거리입니다. seed는 0, 그래프 이웃은 1 또는 2입니다. */
  hopDistance: number;
  /** 벡터 점수, hop 감쇠, edge weight, 연결 보너스를 결합한 최종 랭킹 점수입니다. */
  combinedScore: number;
  /** 원본 벡터 유사도 점수입니다. seed 노드에만 포함됩니다. */
  vectorScore?: number;
  /** 이 결과 노드와 연결된 벡터 seed 노드 개수입니다. */
  connectionCount: number;
}

/**
 * Graph RAG 의미 기반 검색 응답입니다.
 *
 * @public
 */
export interface GraphRagSearchResponse {
  /** 원본 검색어입니다. */
  keyword: string;
  /** 그래프 확장에 사용된 벡터 seed 노드 개수입니다. */
  seedCount: number;
  /** `combinedScore` 내림차순으로 정렬된 결과 노드 목록입니다. */
  nodes: GraphRagNodeResult[];
}

/**
 * Graph RAG 검색 쿼리 파라미터입니다.
 *
 * @public
 */
export interface GraphRagSearchParams {
  /** 검색어입니다. */
  q: string;
  /** 최대 결과 개수입니다. 백엔드는 1부터 50까지 허용합니다. */
  limit?: number;
}
