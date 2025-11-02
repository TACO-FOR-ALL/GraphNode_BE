import { VectorService } from '../../src/core/services/VectorService';
import type { VectorStore } from '../../src/core/ports/VectorStore';

class MockVectorStore implements VectorStore {
  public items: any[] = [];
  async ensureCollection(_c: string) {}
  async upsert(_c: string, items: any[]) { this.items.push(...items); }
  async search(_c: string, _q: number[], opts?: any) {
    // very simple: return items that match userId filter
    const filterUser = opts?.filter?.must?.find((m: any)=>m.key==='userId')?.match?.value;
    const res = (this.items || []).filter(i => i.payload?.userId === filterUser).slice(0, opts?.limit ?? 10).map(i => ({ id: i.id, score: 0.9, payload: i.payload }));
    return res;
  }
  async deleteByFilter(_c: string, _filter: any) { this.items = []; }
}

describe('VectorService (unit)', () => {
  let mock: MockVectorStore;
  let svc: VectorService;

  beforeEach(() => {
    mock = new MockVectorStore();
    svc = new VectorService(mock as unknown as VectorStore);
  });

  test('upsert and search for user', async () => {
    await svc.upsertForUser('u1', [{ id: 'n1', vector: [0.1,0.2], payload: { title: 't' } }]);
    const hits = await svc.searchForUser('u1', [0.1,0.2], { limit: 5 });
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe('n1');
  });

  test('deleteForUser clears items', async () => {
    await svc.upsertForUser('u2', [{ id: 'x', vector: [0], payload: {} }]);
    await svc.deleteForUser('u2');
    const hits = await svc.searchForUser('u2', [0], { limit: 5 });
    expect(hits.length).toBe(0);
  });
});
