import { VectorStore } from '../../core/ports/VectorStore';
import { GraphNodeVectorItem } from '../../core/types/vector/graph-features';
import { UpstreamError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

export class GraphVectorRepository {
  private readonly NODE_COLLECTION = 'nodes_v1';
  // private readonly KEY_COLLECTION = 'keys_v1'; // 추후 키워드용

  constructor(private readonly vectorStore: VectorStore) {}

  /**
   * 전처리된 VectorItem 배열을 받아 Vector DB에 저장합니다.
   * (Mapping 로직은 Handler/Service 레벨로 이동됨)
   * 
   * @param userId 사용자 ID (로깅용)
   * @param items 저장할 VectorItem 배열
   */
  async saveGraphFeatures(userId: string, items: GraphNodeVectorItem[]): Promise<void> {
    try {
      if (!items || items.length === 0) {
        logger.warn({ userId }, 'No vector items to save');
        return;
      }

      // 1. 컬렉션 확보 (Ensure)
      // 차원은 첫 번째 아이템의 벡터 길이로 판단 (기본값 1536)
      const dim = items[0].vector.length > 0 ? items[0].vector.length : 1536;
      await this.vectorStore.ensureCollection(this.NODE_COLLECTION, dim, 'Cosine');

      // 2. 저장 (Upsert)
      await this.vectorStore.upsert(this.NODE_COLLECTION, items);

      logger.info(
        { userId, count: items.length },
        'Graph features persisted to Vector DB'
      );
    } catch (err) {
      throw new UpstreamError('Failed to save graph features', { cause: err as any });
    }
  }

  /**
   * 노드 검색 (키워드/유사도)
   * - 현재는 임베딩 벡터가 제공되어야 검색 가능 (Text-to-Vector 변환은 별도 Service 필요)
   */
  async searchNodes(userId: string, queryVector: number[], limit: number = 5) {
    return this.vectorStore.search(this.NODE_COLLECTION, queryVector, {
      filter: { userId: userId },
      limit: limit,
    });
  }
}
