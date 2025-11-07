/**
 * 모듈: VectorStore Port
 * 책임: 벡터 문서의 CRUD 및 조회를 위한 포트를 정의한다.
 * 외부 의존: 없음.
 */

/**
 * 단일 벡터 항목 표현
 * @property id 항목 식별자
 * @property vector float32 배열(embedding)
 * @property payload 메타데이터(예: userId, conversationId, originalText 등)
 */
export interface VectorItem {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
}


/**
 * VectorStore 포트 인터페이스
 * - 구현체(Qdrant/FAISS/등)는 이 인터페이스를 구현해야 함.
 */
export interface VectorStore {
  /**
   * 컬렉션(또는 namespace) 보장. 구현체는 이미 존재하면 무시.
   */
  ensureCollection(collection: string, dims?: number, distance?: 'Cosine' | 'Euclid' | 'Dot'): Promise<void>;

  /**
   * 벡터 업서트
   * @param collection 컬렉션명
   * @param items 업서트할 VectorItem 배열
   */
  upsert(collection: string, items: VectorItem[]): Promise<void>;

  /**
   * 질의 벡터로 검색(필터 포함)
   * @param collection 컬렉션명
   * @param queryVector 질의 벡터
   * @param opts.filter payload 필터(예: { userId: 'u_1' })
   */
  search(
    collection: string,
    queryVector: number[],
    opts?: { filter?: Record<string, any>; limit?: number }
  ): Promise<Array<{ id: string; score: number; payload?: any }>>;

  /**
   * 필터 기준 삭제
   */
  deleteByFilter(collection: string, filter: Record<string, any>): Promise<void>;
}

