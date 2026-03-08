/**
 * 모듈: VectorStore Port (벡터 저장소 인터페이스)
 *
 * 책임:
 * - 벡터 데이터(Embedding)의 저장, 검색, 삭제를 위한 공통 규약을 정의합니다.
 * - Qdrant, FAISS, Pinecone 등 다양한 벡터 DB 구현체를 교체할 수 있도록 추상화합니다.
 */

/**
 * 단일 벡터 항목 인터페이스
 *
 * @property id 항목 식별자 (UUID 등)
 * @property vector 임베딩 벡터 (float32 배열)
 * @property payload 메타데이터 (예: userId, conversationId, 원본 텍스트 등)
 */
export interface VectorItem {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
}

/**
 * 지식 그래프 노드(Macro Graph Node) 검색 결과 인터페이스
 *
 * @property id 벡터 식별자 (AI 서버에서 생성한 {user_id}_{orig_id})
 * @property score 유사도 점수 (낮을수록 또는 높을수록 유사한지는 엔진마다 다르지만 대개 0-1 사이)
 * @property payload 메타데이터. `orig_id`를 반드시 포함하여 MongoDB의 노드와 매핑 가능해야 함.
 */
export interface MacroNodeSearchResult {
  id: string;
  score: number;
  payload: {
    user_id: string;
    conversation_id: string;
    orig_id: string; // MongoDB의 GraphNodeDoc.origId와 매핑되는 키
    [key: string]: any;
  };
}

/**
 * VectorStore 인터페이스
 *
 * 벡터 DB와 상호작용하는 메서드들을 정의합니다.
 */
export interface VectorStore {
  /**
   * 컬렉션(Collection) 생성 보장
   *
   * - 지정된 이름의 컬렉션이 없으면 생성합니다.
   * - 이미 존재하면 아무 작업도 하지 않습니다.
   *
   * @param collection 컬렉션 이름
   * @param dims 벡터 차원 수 (예: 1536 for OpenAI Ada-002, 384 for MiniLM)
   * @param distance 거리 측정 방식 ('Cosine', 'Euclid', 'Dot')
   */
  ensureCollection(
    collection: string,
    dims?: number,
    distance?: 'Cosine' | 'Euclid' | 'Dot'
  ): Promise<void>;

  /**
   * 벡터 데이터 저장 또는 업데이트 (Upsert)
   *
   * @param collection 컬렉션 이름
   * @param items 저장할 VectorItem 배열
   */
  upsert(collection: string, items: VectorItem[]): Promise<void>;

  /**
   * 유사 벡터 검색 (Search)
   *
   * @param collection 컬렉션 이름
   * @param queryVector 검색할 질의 벡터
   * @param opts 검색 옵션 (필터, 개수 제한)
   * @returns 검색 결과 배열 (MacroNodeSearchResult 형식 준수)
   */
  search(
    collection: string,
    queryVector: number[],
    opts?: { filter?: Record<string, any>; limit?: number }
  ): Promise<MacroNodeSearchResult[]>;

  /**
   * 조건에 맞는 벡터 삭제
   *
   * @param collection 컬렉션 이름
   * @param filter 삭제할 조건 (예: { userId: 'user1' })
   */
  deleteByFilter(collection: string, filter: Record<string, any>): Promise<void>;
}
