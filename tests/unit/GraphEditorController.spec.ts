import { describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

import { GraphEditorController } from '../../src/app/controllers/GraphEditorController';
import type { GraphEditorService } from '../../src/core/services/GraphEditorService';

function makeResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
}

describe('GraphEditorController', () => {
  describe('deleteNode', () => {
    it('forwards the supplied macroId to the backend service', async () => {
      const deleteNode = jest.fn<GraphEditorService['deleteNode']>().mockResolvedValue(undefined);
      const controller = new GraphEditorController({ deleteNode } as unknown as GraphEditorService);
      const req = {
        userId: 'user-1',
        params: { nodeId: '42' },
        query: { permanent: 'true', macroId: 'macro-view-1' },
        body: {},
      } as unknown as Request;
      const res = makeResponse();
      const next = jest.fn() as NextFunction;

      await controller.deleteNode(req, res, next);

      expect(deleteNode).toHaveBeenCalledWith(
        'user-1',
        42,
        true,
        { macroId: 'macro-view-1' }
      );
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('deleteEdge', () => {
    it('forwards the supplied macroId to the backend service', async () => {
      const deleteEdge = jest.fn<GraphEditorService['deleteEdge']>().mockResolvedValue(undefined);
      const controller = new GraphEditorController({ deleteEdge } as unknown as GraphEditorService);
      const req = {
        userId: 'user-1',
        params: { edgeId: 'edge-1' },
        query: { permanent: 'true', macroId: 'macro-view-1' },
        body: {},
      } as unknown as Request;
      const res = makeResponse();
      const next = jest.fn() as NextFunction;

      await controller.deleteEdge(req, res, next);

      expect(deleteEdge).toHaveBeenCalledWith(
        'user-1',
        'edge-1',
        true,
        { macroId: 'macro-view-1' }
      );
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalled();
    });
  });
});
