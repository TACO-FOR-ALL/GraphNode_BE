
/**
 * Graph 정보를 담을 Vector DB 비즈니스 로직 담당
 */


import type { VectorStore, VectorItem } from '../ports/VectorStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';

export class GraphVectorService {
    constructor(private store: VectorStore, private defaultCollection = 'graph_vectors') {}

    /**
     * 사용자 소유의 벡터들을 업서트한다.
     * @param userId 소유자 식별자 (userId를 payload에 포함하여 격리)
     * @param items VectorItem[] (vector + payload without userId)
     */
    async upsertForUser(
        userId: string,
        items: Array<{
            id: string;
            vector: number[];
            payload?: Record<string, any>;
        }>
    ) {
        try {
            if (!userId) throw new ValidationError('userId required');
            if (!Array.isArray(items) || items.length === 0) return; // no-op

            // payload에 userId 주입
            const toStore: VectorItem[] = items.map(i => ({
                id: i.id,
                vector: i.vector,
                payload: { ...(i.payload ?? {}), userId },
            }));

            // 컬렉션 보장 후 업서트
            await this.store.ensureCollection(this.defaultCollection);
            await this.store.upsert(this.defaultCollection, toStore);
        } catch (err: unknown) {
            if (err instanceof AppError) throw err;
            throw new UpstreamError('GraphVectorService.upsertForUser failed', { cause: String(err) });
        }
    }

    /**
     * 사용자 범위에서 유사도 검색
     * @param userId 검색 대상 사용자 (권한/격리를 위해 필터로 사용)
     * @param queryVector embedding vector
     */
    async searchForUser(userId: string, queryVector: number[], opts?: { limit?: number }) {
        try {
            if (!userId) throw new ValidationError('userId required');
            if (!Array.isArray(queryVector) || queryVector.length === 0) throw new ValidationError('queryVector required');

            // Qdrant 호환 filter (user isolation)
            const filter = {
                must: [{ key: 'userId', match: { value: userId } }],
            };

            const hits = await this.store.search(this.defaultCollection, queryVector, { filter, limit: opts?.limit });
            return hits;
        } catch (err: unknown) {
            if (err instanceof AppError) throw err;
            throw new UpstreamError('GraphVectorService.searchForUser failed', { cause: String(err) });
        }
    }

    /**
     * 사용자 소유 벡터 삭제 (filter 기반)
     * @param userId 소유자 ID (required)
     * @param extraFilter 추가 필터(예: conversationId 등)
     * @throws {Error}
     */
    async deleteForUser(userId: string, extraFilter?: Record<string, any>) {
        try {
            if (!userId) throw new ValidationError('userId required');

            const must = [{ key: 'userId', match: { value: userId } }];

            // extraFilter이 있을 경우 must에 추가 (간단 변환 - AI팀 요구에 따라 확장)
            if (extraFilter) {
                // extraFilter 은 { key: value } 형태 기대. key별로 match 추가
                for (const [k, v] of Object.entries(extraFilter)) {
                    must.push({ key: k, match: { value: v } });
                }
            }

            const filter = { must };
            await this.store.deleteByFilter(this.defaultCollection, filter);
        } catch (err: unknown) {
            if (err instanceof AppError) throw err;
            throw new UpstreamError('GraphVectorService.deleteForUser failed', { cause: String(err) });
        }
    }
}
