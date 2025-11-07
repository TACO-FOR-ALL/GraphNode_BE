/**
 * QdrantClientAdapter (Qdrant 구현)
 */

import { QdrantClient } from '@qdrant/js-client-rest';

import { VectorStore, VectorItem } from '../../core/ports/VectorStore';
import { logger } from '../../shared/utils/logger';

//TODO : fixme - implement actual Qdrant client logic
export class QdrantClientAdapter implements VectorStore {
    private client: QdrantClient;
  
    /**
   * @param baseUrl Qdrant endpoint (https://...)
   * @param apiKey Qdrant Cloud API key (optional)
   */
    constructor(private baseUrl: string, private apiKey?: string) {

        this.client = new QdrantClient({
            url: this.baseUrl,
            apiKey: this.apiKey,
        })
    }

    //TODO : fixme

    /**
     * Collection 존재 검증 메서드
     * @param collection 
     * @param dims 
     * @param distance 
     */
    async ensureCollection(collection: string, dims = 1536, distance: 'Cosine' | 'Euclid' | 'Dot' ) {
        logger.info({ event: 'vector.ensureCollection', collection, dims, distance }, 'ensureCollection start');

        //Collection 존재 검증 확인
        const existResp = await this.client.collectionExists(collection);   

        // 존재 시 return
        if (existResp.exists) {
            return;
        }

        // 없을 시 Collection 생성
        await this.client.createCollection(
            collection, 
            {
                vectors: {
                    size: dims,
                    distance: distance,
                },
            }
        );
    }

    /**
     * 벡터 아이템을 추가/갱신하는 메서드
     * @param collection 
     * @param items 
     */
    async upsert(collection: string, items: VectorItem[]) {
        logger.info({ event: 'vector.upsert', collection, count: items.length }, 'upsert start');

        // 벡터 포인트 생성
        const points = items.map(i => ({
            id: i.id,
            vector: i.vector,
            payload: i.payload ?? {},
        }));

        // 벡터 포인트 업서트
        await this.client.upsert(collection, { points });
    }

    /**
     * 벡터 유사도 검색 메서드
     * @param collection 
     * @param queryVector 
     * @param opts 
     * @returns { id, score, payload }[ 
     */
    async search(collection: string, queryVector: number[], opts?: { filter?: Record<string, any>; limit?: number }) {
        logger.info({ event: 'vector.search', collection, queryVector }, 'search start');

        // 벡터 검색
        const resp = await this.client.search(collection, {
            vector: queryVector,
            limit: opts?.limit ?? 10,
            with_payload: true,
            filter: opts?.filter,
        });

        // resp는 SDK 타입의 배열
        return (resp ?? []).map(hit => ({
            id: String(hit.id),
            score: hit.score,
            payload: hit.payload,
        }));

    }

    /**
     *  필터 조건에 맞는 벡터 삭제 메서드
     * @param collection 
     * @param filter 
     */
    async deleteByFilter(collection: string, filter: Record<string, any>) {
        logger.info({ event: 'vector.deleteByFilter', collection, filter }, 'deleteByFilter start');

        await this.client.delete(collection, { filter });
    }
}