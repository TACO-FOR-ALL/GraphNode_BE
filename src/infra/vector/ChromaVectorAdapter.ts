import { Collection, IncludeEnum } from 'chromadb';
import { VectorStore, VectorItem } from '../../core/ports/VectorStore';
import { getChromaClient } from '../db/chroma';
import { logger } from '../../shared/utils/logger';
import { AppError, UpstreamError } from '../../shared/errors/domain';

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
      if (distance === 'Cosine') metadata = { 'hnsw:space': 'cosine' };
      if (distance === 'Euclid') metadata = { 'hnsw:space': 'l2' };
      if (distance === 'Dot') metadata = { 'hnsw:space': 'ip' };

      // getOrCreateCollection 사용 (존재하면 가져오고 없으면 생성)
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

      // Upsert 실행
      await collection.upsert({
        ids,
        embeddings,
        metadatas,
      });

      logger.debug({ count: items.length }, 'Upserted vectors to ChromaDB');
    } catch (err) {
      throw new UpstreamError('Failed to upsert vectors to ChromaDB', { cause: err as any });
    }
  }

  /**
   * 유사 벡터 검색
   */
  async search(
    collectionName: string,
    queryVector: number[],
    opts?: { filter?: Record<string, any>; limit?: number }
  ): Promise<Array<{ id: string; score: number; payload?: any }>> {
    try {
      const client = getChromaClient();
      const collection = await client.getCollection({ name: collectionName });

      const limit = opts?.limit || 10;
      const where = opts?.filter || undefined; // ChromaDB filter format (e.g. { "userId": "..." })

      const result = await collection.query({
        queryEmbeddings: [queryVector],
        nResults: limit,
        where: where,
        include: ['metadatas', 'distances'] as any, // Bypass strict enum check regarding strict casing or import
      });

      // 결과 매핑
      const ids = result.ids[0];
      const distances = result.distances?.[0] || [];
      const metadatas = result.metadatas?.[0] || [];

      const mapped = ids.map((id, idx) => ({
        id,
        score: distances[idx] ?? 0, // Handle null/undefined score
        payload: metadatas[idx] || undefined,
      }));

      return mapped;
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

      logger.info({ filter }, 'Deleted vectors from ChromaDB');
    } catch (err) {
      throw new UpstreamError('Failed to delete vectors from ChromaDB', { cause: err as any });
    }
  }
}
