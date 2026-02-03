import { VectorStore } from '../../core/ports/VectorStore';
import { GraphFeaturesJsonDto, GraphNodeVectorItem } from '../../core/types/vector/graph-features';
import { UpstreamError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

export class GraphVectorRepository {
  private readonly NODE_COLLECTION = 'nodes_v1';
  // private readonly KEY_COLLECTION = 'keys_v1'; // 추후 키워드용

  constructor(private readonly vectorStore: VectorStore) {}

  /**
   * features.json 데이터를 파싱하여 Vector DB에 저장합니다.
   * @param userId 사용자 ID
   * @param features features.json 객체 (GraphFeaturesJsonDto)
   */
  async saveGraphFeatures(userId: string, features: GraphFeaturesJsonDto): Promise<void> {
    try {
      const { conversations, embeddings } = features;

      if (!conversations || !embeddings || conversations.length !== embeddings.length) {
        logger.warn('Invalid features.json structure or mismatch length');
        return;
      }

      // 1. VectorItem으로 변환
      const items: GraphNodeVectorItem[] = conversations.map((conv, idx) => {
        const vector = embeddings[idx];
        const keywordsList = conv.keywords.map((k) => k.term);
        // Vector DB Metadata 제한(Nested Object 불가)으로 인해 상세 정보는 JSON String으로 저장
        const keywordDetailsStr = JSON.stringify(conv.keywords);

        return {
          id: conv.orig_id, // Conversation UUID
          vector: vector,
          metadata: {
            origId: conv.orig_id,
            nodeId: conv.id,
            userId: userId,
            keywords: keywordsList,
            keywordDetails: keywordDetailsStr,
            messageCount: conv.num_messages,
            createTime: conv.create_time,
            updateTime: conv.update_time,
          },
        };
      });

      // 2. 컬렉션 확보 (Ensure)
      // 차원은 embeddings[0]에서 가져오거나 기본값 사용
      const dim = embeddings.length > 0 ? embeddings[0].length : 1536; // Default to OpenAI dim if empty
      await this.vectorStore.ensureCollection(this.NODE_COLLECTION, dim, 'Cosine');

      // 3. 저장 (Upsert)
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
