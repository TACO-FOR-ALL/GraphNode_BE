import { describe, expect, it, jest } from '@jest/globals';

import { SearchController } from '../../src/app/controllers/SearchController';

describe('SearchController.graphRagSearch', () => {
  function createResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as any;
  }

  it('routes q and limit to SearchService.graphRagSearch', async () => {
    const graphRagSearch = jest.fn<any>().mockResolvedValue({
      keyword: 'deep learning',
      seedCount: 1,
      nodes: [
        {
          origId: 'conv-1',
          title: 'Deep learning notes',
          nodeType: 'conversation',
          clusterName: 'AI',
          hopDistance: 0,
          combinedScore: 0.91,
          vectorScore: 0.91,
          connectionCount: 0,
        },
      ],
    });
    const controller = new SearchController({ graphRagSearch } as any);
    const req = { userId: 'user-1', query: { q: 'deep learning', limit: '7' } } as any;
    const res = createResponse();
    const next = jest.fn();

    await controller.graphRagSearch(req, res, next as any);

    expect(graphRagSearch).toHaveBeenCalledWith('user-1', 'deep learning', 7);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      keyword: 'deep learning',
      seedCount: 1,
      nodes: [
        expect.objectContaining({
          origId: 'conv-1',
          title: 'Deep learning notes',
          clusterName: 'AI',
          combinedScore: 0.91,
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid limit before calling the service', async () => {
    const graphRagSearch = jest.fn<any>();
    const controller = new SearchController({ graphRagSearch } as any);
    const req = { userId: 'user-1', query: { q: 'deep learning', limit: '0' } } as any;
    const res = createResponse();
    const next = jest.fn();

    await controller.graphRagSearch(req, res, next as any);

    expect(graphRagSearch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
