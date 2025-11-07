/**
 * VectorService: vector DB related logic extracted from previous GraphVectorService.
 */
import type { VectorStore, VectorItem } from '../ports/VectorStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';

export class VectorService {
  constructor(private store: VectorStore, private defaultCollection = 'graph_vectors') {}

  /**
   * Upsert vectors for a specific user (payload will include userId).
   * @param userId - The user ID to scope the vectors.
   * @param items - Array of vector items to upsert.
   * @throws {ValidationError|UpstreamError}
   * 
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

      const toStore: VectorItem[] = items.map(i => ({ id: i.id, vector: i.vector, payload: { ...(i.payload ?? {}), userId } }));

      await this.store.ensureCollection(this.defaultCollection);
      await this.store.upsert(this.defaultCollection, toStore);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('VectorService.upsertForUser failed', { cause: String(err) });
    }
  }

  /**
   * Search vectors for a user-scoped query vector.
   * @param userId - The user ID to scope the search.
   * @param queryVector - The query vector.
   * @param opts - Optional search options (limit).
   * @returns Array of search hits with id, score, payload.
   * @throws {ValidationError|UpstreamError}
   */
  async searchForUser(userId: string, queryVector: number[], opts?: { limit?: number; filter?: Record<string, any> }) {
    try {
      if (!userId) throw new ValidationError('userId required');
      if (!Array.isArray(queryVector) || queryVector.length === 0) throw new ValidationError('queryVector required');
      // base filter limits results to the user; merge optional caller filter
      const baseMust: any[] = [{ key: 'userId', match: { value: userId } }];
      let filter: any = { must: baseMust };
      if (opts?.filter) {
        for (const [k, v] of Object.entries(opts.filter)) {
          baseMust.push({ key: k, match: { value: v } });
        }
        filter = { must: baseMust };
      }

      const hits = await this.store.search(this.defaultCollection, queryVector, { filter, limit: opts?.limit });
      return hits;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('VectorService.searchForUser failed', { cause: String(err) });
    }
  }

  /**
   * Delete vectors for a user by filter.
   * @param userId - The user ID to scope the deletion.
   * @param extraFilter - Additional filter criteria.
   * @throws {ValidationError|UpstreamError}
   */
  async deleteForUser(userId: string, extraFilter?: Record<string, any>) {
    try {
      if (!userId) throw new ValidationError('userId required');

      const must: any[] = [{ key: 'userId', match: { value: userId } }];
      if (extraFilter) {
        for (const [k, v] of Object.entries(extraFilter)) {
          must.push({ key: k, match: { value: v } });
        }
      }
      const filter = { must };
      await this.store.deleteByFilter(this.defaultCollection, filter as any);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('VectorService.deleteForUser failed', { cause: String(err) });
    }
  }
}
