/**
 * In-memory VectorStore used as a fallback in tests or when Qdrant isn't available.
 *
 * TEST-ONLY: This implementation is intended for local development and
 * automated tests only. It keeps data in-process (memory) and is NOT
 * suitable for production use. Do not rely on this store for durability or
 * scalability. In production, configure a real vector DB (Qdrant, FAISS, etc.)
 * and ensure `initQdrant` is called during bootstrap.
 */
import { VectorStore, VectorItem } from '../../core/ports/VectorStore';

type Collection = { items: Map<string, VectorItem>; dims?: number };

export class MemoryVectorStore implements VectorStore {
  private collections: Map<string, Collection> = new Map();

  async ensureCollection(collection: string, dims = 0): Promise<void> {
    if (!this.collections.has(collection)) {
      this.collections.set(collection, { items: new Map(), dims });
    }
  }

  async upsert(collection: string, items: VectorItem[]): Promise<void> {
    await this.ensureCollection(collection);
    const col = this.collections.get(collection)!;
    for (const it of items) {
      col.items.set(it.id, { ...it });
    }
  }

  // very small helper for cosine similarity
  private dot(a: number[], b: number[]) {
    let s = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
    return s;
  }

  private norm(a: number[]) {
    return Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  }

  async search(
    collection: string,
    queryVector: number[],
    opts?: { filter?: Record<string, any>; limit?: number }
  ): Promise<Array<{ id: string; score: number; payload?: any }>> {
    const col = this.collections.get(collection);
    if (!col) return [];
    const results: Array<{ id: string; score: number; payload?: any }> = [];
    const qnorm = this.norm(queryVector) || 1;
    for (const it of col.items.values()) {
      if (opts?.filter) {
        let ok = true;
        for (const k of Object.keys(opts.filter)) {
          if ((it.payload ?? {})[k] !== (opts.filter as any)[k]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      const score = this.dot(queryVector, it.vector) / (qnorm * (this.norm(it.vector) || 1));
      results.push({ id: it.id, score, payload: it.payload });
    }
    results.sort((a, b) => b.score - a.score);
    const limit = opts?.limit ?? 10;
    return results.slice(0, limit);
  }

  async deleteByFilter(collection: string, filter: Record<string, any>): Promise<void> {
    const col = this.collections.get(collection);
    if (!col) return;
    for (const [id, it] of Array.from(col.items.entries())) {
      let match = true;
      for (const k of Object.keys(filter)) {
        if ((it.payload ?? {})[k] !== (filter as any)[k]) {
          match = false;
          break;
        }
      }
      if (match) col.items.delete(id);
    }
  }
}

export default MemoryVectorStore;
