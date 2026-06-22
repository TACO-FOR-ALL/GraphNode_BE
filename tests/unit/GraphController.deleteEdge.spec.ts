import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

import { GraphController } from '../../src/app/controllers/GraphController';
import type { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import type { GraphManagementService } from '../../src/core/services/GraphManagementService';
import type { GraphVectorService } from '../../src/core/services/GraphVectorService';

function makeResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
}

describe('GraphController.deleteEdge', () => {
  it('forwards the supplied macroId to the backend delete request', async () => {
    const deleteEdge = jest.fn<GraphEmbeddingService['deleteEdge']>().mockResolvedValue(undefined);
    const controller = new GraphController(
      { deleteEdge } as unknown as GraphEmbeddingService,
      {} as GraphVectorService,
      {} as GraphManagementService
    );
    const req = {
      userId: 'user-1',
      params: { edgeId: 'edge-1' },
      query: { permanent: 'true', macroId: 'macro-view-1' },
      body: {},
    } as unknown as Request;
    const res = makeResponse();

    await controller.deleteEdge(req, res);

    expect(deleteEdge).toHaveBeenCalledWith(
      'user-1',
      'edge-1',
      true,
      { macroId: 'macro-view-1' }
    );
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
  });
});
