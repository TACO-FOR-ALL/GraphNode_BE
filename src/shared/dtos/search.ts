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

/**
 * Graph RAG 검색 결과 단일 노드 항목.
 *
 * ChromaDB 벡터 검색(Seed 추출) + Neo4j 그래프 확장(이웃 탐색)을 결합한 결과입니다.
 *
 * @property origId 원본 데이터 ID (conversation, note, notion, file 실제 ID)
 * @property nodeType 노드 유형 ('conversation' | 'note' | 'notion' | 'file')
 * @property hopDistance Seed 노드로부터의 그래프 거리 (0=seed, 1=1홉, 2=2홉)
 * @property combinedScore 벡터 유사도 + 그래프 구조 + 엣지 가중치를 결합한 최종 랭킹 점수
 * @property vectorScore Seed 노드인 경우 ChromaDB 코사인 유사도 점수 (0~1)
 * @property connectionCount 이 노드에 연결된 Seed 노드의 수 (복수 Seed와 연결될수록 관련성 높음)
 */
export interface GraphRagNodeResult {
  /** 원본 데이터 ID */
  origId: string;
  /** 원본 문서에서 해석한 노드 제목입니다. 찾을 수 없으면 null입니다. */
  title: string | null;
  /** 노드 유형 */
  nodeType: string;
  /** 노드가 속한 클러스터 이름입니다. 찾을 수 없으면 null입니다. */
  clusterName: string | null;
  /** Seed 노드로부터의 홉 거리 */
  hopDistance: number;
  /** 최종 랭킹 점수 */
  combinedScore: number;
  /** Seed 노드의 ChromaDB 벡터 유사도 점수 */
  vectorScore?: number;
  /** 연결된 Seed 노드 수 */
  connectionCount: number;
}

/**
 * Graph RAG 검색 파이프라인 전체 결과 DTO.
 *
 * keyword → ChromaDB 벡터 검색 → Neo4j 그래프 확장의 3단계 파이프라인 결과입니다.
 *
 * @property keyword 입력된 검색 키워드
 * @property seedCount ChromaDB 벡터 검색에서 추출된 Seed 노드 수
 * @property nodes combinedScore 내림차순으로 정렬된 결과 노드 목록
 */
export interface GraphRagSearchResult {
  /** 검색 키워드 */
  keyword: string;
  /** 벡터 검색으로 추출된 Seed 노드 수 */
  seedCount: number;
  /** combinedScore 내림차순 정렬 결과 */
  nodes: GraphRagNodeResult[];
}
