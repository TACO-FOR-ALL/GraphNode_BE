import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ChromaVectorAdapter } from '../../src/infra/vector/ChromaVectorAdapter';
import { getChromaClient } from '../../src/infra/db/chroma';

jest.mock('../../src/infra/db/chroma', () => ({
  getChromaClient: jest.fn(),
}));

describe('ChromaVectorAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Chroma distance를 높을수록 좋은 similarity score로 변환한다', async () => {
    const query = jest.fn().mockResolvedValue({
      ids: [['near', 'far']],
      distances: [[0.2, 0.9]],
      metadatas: [[{ orig_id: 'near-id' }, { orig_id: 'far-id' }]],
    } as never);
    const getCollection = jest.fn().mockResolvedValue({ query } as never);
    (getChromaClient as jest.Mock).mockReturnValue({ getCollection });

    const adapter = new ChromaVectorAdapter();
    const results = await adapter.search('macro_node_all_minilm_l6_v2', [0.1, 0.2], {
      filter: { user_id: 'user-1' },
      limit: 2,
    });

    expect(results).toEqual([
      { id: 'near', score: 0.8, payload: { orig_id: 'near-id' } },
      { id: 'far', score: 0.09999999999999998, payload: { orig_id: 'far-id' } },
    ]);
  });
});
