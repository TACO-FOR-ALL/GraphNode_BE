import { VectorStore, VectorItem, MacroNodeSearchResult } from '../../core/ports/VectorStore';
import { getChromaClient } from '../db/chroma';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * @description ChromaDB가 반환한 distance를 Graph RAG 랭킹용 similarity score로 변환합니다. 작성일자: 2026-04-29.
 *
 * ChromaDB query는 낮을수록 가까운 distance를 반환하지만, VectorStore port의 score는 높을수록 관련도가
 * 높은 값이어야 합니다. Macro graph collection은 cosine distance를 사용하므로 `1 - distance`를 0~1 범위로
 * 제한해 반환합니다.
 *
 * @param distance ChromaDB query 결과의 distance 값입니다.
 * @returns 높을수록 관련도가 높은 0~1 similarity score입니다.
 */
function chromaDistanceToSimilarity(distance: unknown): number {
  const numericDistance = Number(distance);
  if (!Number.isFinite(numericDistance)) return 0;

  // cosine distance는 낮을수록 유사하므로 score 방향을 뒤집습니다.
  return Math.max(0, Math.min(1, 1 - numericDistance));
}

export class ChromaVectorAdapter implements VectorStore {
  /**
   * @description ChromaDB 컬렉션이 없으면 생성하고, 있으면 기존 컬렉션을 재사용합니다.
   *
   * @param name 컬렉션 이름입니다.
   * @param dims 벡터 차원 수입니다. 현재 ChromaDB 생성 호출에는 참고 정보로만 사용합니다.
   * @param distance 컬렉션에서 사용할 거리 측정 방식입니다.
   */
  async ensureCollection(
    name: string,
    dims?: number,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
  ): Promise<void> {
    try {
      const client = getChromaClient();

      // ChromaDB의 내부 거리 메트릭 이름으로 변환합니다. (Chroma: l2, ip, cosine)
      let metadata: Record<string, any> | undefined;
      // ChromaDB Cloud/Local은 거리 메트릭 설정에 "hnsw:space" 메타데이터를 사용합니다.
      if (distance === 'Cosine') metadata = { 'hnsw:space': 'cosine' };
      if (distance === 'Euclid') metadata = { 'hnsw:space': 'l2' };
      if (distance === 'Dot') metadata = { 'hnsw:space': 'ip' };

      // 컬렉션이 이미 있으면 가져오고, 없으면 지정한 메타데이터로 생성합니다.
      await client.getOrCreateCollection({
        name,
        metadata,
        // embeddingFunction은 외부에서 생성한 embedding을 직접 넣기 때문에 지정하지 않습니다.
      });

      logger.info({ name, dims, distance }, 'ChromaDB Collection ensured');
    } catch (err) {
      throw new UpstreamError('Failed to ensure Chroma collection', { cause: err as any });
    }
  }

  /**
   * @description 벡터 데이터를 ChromaDB 컬렉션에 저장하거나 갱신합니다.
   *
   * @param collectionName 저장 대상 컬렉션 이름입니다.
   * @param items 저장할 벡터 항목 목록입니다.
   */
  async upsert(collectionName: string, items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;

    try {
      const client = getChromaClient();
      const collection = await client.getCollection({ name: collectionName });

      // ChromaDB upsert 입력 형식에 맞게 id, embedding, metadata 배열로 분리합니다.
      const ids = items.map((i) => i.id);
      const embeddings = items.map((i) => i.vector);
      const metadatas = items.map((i) => i.payload || {});

      // 같은 id가 이미 존재하면 갱신되고, 없으면 새로 저장됩니다.
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
   * @description MacroGraph 노드 벡터와 유사한 항목을 ChromaDB에서 검색합니다.
   *
   * ChromaDB는 distance를 반환하므로, 응답을 VectorStore port 형식으로 변환하면서
   * distance를 similarity score로 바꿉니다.
   *
   * @param collectionName 검색 대상 컬렉션 이름입니다.
   * @param queryVector 검색에 사용할 query embedding 벡터입니다.
   * @param opts 검색 필터와 결과 개수 제한 옵션입니다.
   * @returns VectorStore port 형식의 MacroNodeSearchResult 목록입니다.
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
      const where = opts?.filter || undefined; // ChromaDB 필터 형식입니다. 예: { "user_id": "..." }

      const result = await collection.query({
        queryEmbeddings: [queryVector],
        nResults: limit,
        where: where,
        include: ['metadatas', 'distances'] as any,
      });

      // ChromaDB 응답 배열을 VectorStore port 형식으로 변환합니다.
      const ids = result.ids[0];
      const distances = result.distances?.[0] || [];
      const metadatas = result.metadatas?.[0] || [];

      return ids.map((id, idx) => ({
        id,
        score: chromaDistanceToSimilarity(distances[idx]),
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
   * @description 지정한 metadata filter에 해당하는 벡터들을 ChromaDB 컬렉션에서 삭제합니다.
   *
   * @param collectionName 삭제 대상 컬렉션 이름입니다.
   * @param filter 삭제할 벡터를 고르는 ChromaDB where filter입니다.
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
