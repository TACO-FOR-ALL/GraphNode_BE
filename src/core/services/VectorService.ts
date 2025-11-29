/**
 * 모듈: VectorService (벡터 서비스)
 * 
 * 책임:
 * - 벡터 데이터베이스와 관련된 비즈니스 로직을 처리합니다.
 * - GraphVectorService에서 분리된 벡터 전용 로직을 담고 있습니다.
 * - 벡터 데이터의 저장(Upsert), 검색(Search), 삭제(Delete) 기능을 제공합니다.
 */

import type { VectorStore, VectorItem } from '../ports/VectorStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';

export class VectorService {
  constructor(private store: VectorStore, private defaultCollection = 'graph_vectors') {}

  /**
   * 사용자별 벡터 데이터 저장 (Upsert)
   * 
   * @param userId 사용자 ID (벡터 데이터의 소유자)
   * @param items 저장할 벡터 아이템 배열 (id, vector, payload)
   * @throws {ValidationError} 유효하지 않은 입력값일 경우
   * @throws {UpstreamError} DB 작업 실패 시
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
      if (!Array.isArray(items) || items.length === 0) return; // 저장할 항목이 없으면 종료

      // 페이로드에 userId를 자동으로 추가하여 데이터 격리 보장
      const toStore: VectorItem[] = items.map(i => ({ 
        id: i.id, 
        vector: i.vector, 
        payload: { ...(i.payload ?? {}), userId } 
      }));

      // 컬렉션이 존재하는지 확인하고 없으면 생성
      await this.store.ensureCollection(this.defaultCollection);
      
      // 벡터 데이터 저장
      await this.store.upsert(this.defaultCollection, toStore);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('VectorService.upsertForUser failed', { cause: String(err) });
    }
  }

  /**
   * 사용자별 벡터 검색 (Search)
   * 
   * @param userId 사용자 ID (검색 범위 제한)
   * @param queryVector 검색할 질의 벡터
   * @param opts 검색 옵션 (개수 제한, 추가 필터)
   * @returns 검색 결과 배열 (유사도 점수 포함)
   * @throws {ValidationError} 유효하지 않은 입력값일 경우
   * @throws {UpstreamError} DB 작업 실패 시
   */
  async searchForUser(userId: string, queryVector: number[], opts?: { limit?: number; filter?: Record<string, any> }) {
    try {
      if (!userId) throw new ValidationError('userId required');
      if (!Array.isArray(queryVector) || queryVector.length === 0) throw new ValidationError('queryVector required');
      
      // 기본 필터: userId가 일치하는 데이터만 검색 (보안)
      const baseMust: any[] = [{ key: 'userId', match: { value: userId } }];
      let filter: any = { must: baseMust };
      
      // 추가 필터가 있다면 병합
      if (opts?.filter) {
        for (const [k, v] of Object.entries(opts.filter)) {
          baseMust.push({ key: k, match: { value: v } });
        }
        filter = { must: baseMust };
      }

      // 벡터 검색 수행
      const hits = await this.store.search(this.defaultCollection, queryVector, { filter, limit: opts?.limit });
      return hits;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('VectorService.searchForUser failed', { cause: String(err) });
    }
  }

  /**
   * 사용자별 벡터 데이터 삭제
   * 
   * @param userId 사용자 ID
   * @param extraFilter (선택) 추가 삭제 조건
   * @throws {ValidationError} 유효하지 않은 입력값일 경우
   * @throws {UpstreamError} DB 작업 실패 시
   */
  async deleteForUser(userId: string, extraFilter?: Record<string, any>) {
    try {
      if (!userId) throw new ValidationError('userId required');

      // 기본 필터: userId가 일치하는 데이터만 삭제
      const must: any[] = [{ key: 'userId', match: { value: userId } }];
      
      // 추가 필터 병합
      if (extraFilter) {
        for (const [k, v] of Object.entries(extraFilter)) {
          must.push({ key: k, match: { value: v } });
        }
      }
      const filter = { must };
      
      // 삭제 수행
      await this.store.deleteByFilter(this.defaultCollection, filter as any);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('VectorService.deleteForUser failed', { cause: String(err) });
    }
  }
}
