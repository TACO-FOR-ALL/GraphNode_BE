import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

import { GraphController } from '../../src/app/controllers/GraphController';
import type { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import type { GraphManagementService } from '../../src/core/services/GraphManagementService';
import type { GraphVectorService } from '../../src/core/services/GraphVectorService';
import type { GraphEdgeDto } from '../../src/shared/dtos/graph';

function makeResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
}

describe('GraphController.createEdge', () => {
  it('persists a new edge only under the supplied macroId', async () => {
    const edgesByMacroId = new Map<string, GraphEdgeDto[]>();
    const graphEmbeddingService = {
      upsertEdge: jest.fn<GraphEmbeddingService['upsertEdge']>(async (edge, options) => {
        const macroId = options?.macroId ?? edge.userId;
        const savedEdge = { ...edge, id: 'edge-1' };
        edgesByMacroId.set(macroId, [...(edgesByMacroId.get(macroId) ?? []), savedEdge]);
        return savedEdge.id;
      }),
      listEdges: jest.fn<GraphEmbeddingService['listEdges']>(async (_userId, options) => {
        return edgesByMacroId.get(options?.macroId ?? _userId) ?? [];
      }),
    } as unknown as GraphEmbeddingService;
    const controller = new GraphController(
      graphEmbeddingService,
      {} as GraphVectorService,
      {} as GraphManagementService
    );

    await controller.createEdge(
      {
        userId: 'user-1',
        query: { macroId: 'macro-view-1' },
        body: {
          source: 1,
          target: 2,
          weight: 1,
          type: 'hard',
          intraCluster: false,
        },
      } as unknown as Request,
      makeResponse()
    );

    const macroOneResponse = makeResponse();
    await controller.listEdges(
      {
        userId: 'user-1',
        query: { macroId: 'macro-view-1' },
        body: {},
      } as unknown as Request,
      macroOneResponse
    );

    const macroTwoResponse = makeResponse();
    await controller.listEdges(
      {
        userId: 'user-1',
        query: { macroId: 'macro-view-2' },
        body: {},
      } as unknown as Request,
      macroTwoResponse
    );

    expect(graphEmbeddingService.upsertEdge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', source: 1, target: 2 }),
      { macroId: 'macro-view-1' }
    );
    expect(macroOneResponse.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'edge-1', source: 1, target: 2 }),
    ]);
    expect(macroTwoResponse.json).toHaveBeenCalledWith([]);
  });
});
