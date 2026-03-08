import { VectorStore, VectorItem, MacroNodeSearchResult } from '../../core/ports/VectorStore';
import { getChromaClient } from '../db/chroma';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

export class ChromaVectorAdapter implements VectorStore {
  /**
   * 컬렉션 생성 보장
   */
  async ensureCollection(
    name: string,
    dims?: number,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
  ): Promise<void> {
    try {
      const client = getChromaClient();

      // 거리 메트릭 매핑 (Chroma: l2, ip, cosine)
      let metadata: Record<string, any> | undefined;
      // ChromaDB Cloud/Local uses "hnsw:space" for distance metric
      if (distance === 'Cosine') metadata = { 'hnsw:space': 'cosine' };
      if (distance === 'Euclid') metadata = { 'hnsw:space': 'l2' };
      if (distance === 'Dot') metadata = { 'hnsw:space': 'ip' };

      // getOrCreateCollection 사용 (존재하면 가져오고 없으면 생성)
      // CloudClient에서도 동일하게 동작
      await client.getOrCreateCollection({
        name,
        metadata,
        // embeddingFunction: ... (기본값 사용 또는 별도 지정)
      });

      logger.info({ name, dims, distance }, 'ChromaDB Collection ensured');
    } catch (err) {
      throw new UpstreamError('Failed to ensure Chroma collection', { cause: err as any });
    }
  }

  /**
   * 벡터 데이터 저장 또는 업데이트 (Upsert)
   * ChromaDB는 upsert 메서드를 지원합니다.
   */
  async upsert(collectionName: string, items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;

    try {
      const client = getChromaClient();
      const collection = await client.getCollection({ name: collectionName });

      // ChromaDB 입력 포맷 분리
      const ids = items.map((i) => i.id);
      const embeddings = items.map((i) => i.vector);
      const metadatas = items.map((i) => i.payload || {});

      // Upsert 실행 (CloudClient 호환)
      await collection.upsert({
        ids,
        embeddings,
        metadatas,
      });

      logger.debug({ count: items.length, collectionName }, 'Upserted vectors to ChromaDB');
    } catch (err) {
      throw new UpstreamError('Failed to upsert vectors to ChromaDB', { cause: err as any });
    }
  }

  /**
   * MacroGraph의 Node 에 대응되는 Embedding Vector에 대한 유사 벡터 검색
   * 
   * @param collectionName 컬렉션 이름
   * @param queryVector 검색할 질의 벡터
   * @param opts 검색 옵션 (필터, 개수 제한)
   * @returns 검색 결과 배열 (MacroNodeSearchResult 형식 준수)
   */
  async search(
    collectionName: string,
    queryVector: number[],
    opts?: { filter?: Record<string, any>; limit?: number }
  ): Promise<MacroNodeSearchResult[]> {
    try {
      const client = getChromaClient();
      const collection = await client.getCollection({ name: collectionName });

      const limit = opts?.limit || 10;
      const where = opts?.filter || undefined; // ChromaDB filter format (e.g. { "user_id": "..." })

      const result = await collection.query({
        queryEmbeddings: [queryVector],
        nResults: limit,
        where: where,
        include: ['metadatas', 'distances'] as any,
      });

      // 결과 매핑
      const ids = result.ids[0];
      const distances = result.distances?.[0] || [];
      const metadatas = result.metadatas?.[0] || [];

      return ids.map((id, idx) => ({
        id,
        score: distances[idx] ?? 0,
        payload: (metadatas[idx] as any) || {
          user_id: '',
          conversation_id: '',
          orig_id: '',
        },
      }));
    } catch (err) {
      throw new UpstreamError('Failed to search vectors in ChromaDB', { cause: err as any });
    }
  }

  /**
   * 조건에 맞는 벡터 삭제
   */
  async deleteByFilter(collectionName: string, filter: Record<string, any>): Promise<void> {
    try {
      const client = getChromaClient();
      const collection = await client.getCollection({ name: collectionName });

      await collection.delete({
        where: filter,
      });

      logger.info({ filter, collectionName }, 'Deleted vectors from ChromaDB');
    } catch (err) {
      throw new UpstreamError('Failed to delete vectors from ChromaDB', { cause: err as any });
    }
  }
}
