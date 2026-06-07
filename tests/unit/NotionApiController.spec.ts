import type { Request, Response, NextFunction } from 'express';
import { NotionApiController } from '../../src/app/controllers/NotionApiController';
import type { NotionService } from '../../src/core/services/NotionService';
import { ValidationError } from '../../src/shared/errors/domain';

describe('NotionApiController', () => {
  let notionService: jest.Mocked<NotionService>;
  let controller: NotionApiController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    notionService = {
      searchRootPages: jest.fn(),
      listBlockChildrenProxy: jest.fn(),
    } as unknown as jest.Mocked<NotionService>;

    controller = new NotionApiController(notionService);

    req = {
      params: {},
      query: {},
    } as Partial<Request>;
    (req as any).user = { id: 'user-123' };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response>;

    next = jest.fn();
  });

  describe('getRootPages', () => {
    it('returns root pages successfully', async () => {
      notionService.searchRootPages.mockResolvedValueOnce([{ id: 'page-1' }] as any);

      await controller.getRootPages(req as Request, res as Response, next);

      expect(notionService.searchRootPages).toHaveBeenCalledWith('user-123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ results: [{ id: 'page-1' }] });
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with ValidationError if userId is missing', async () => {
      (req as any).user = undefined;

      await controller.getRootPages(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(notionService.searchRootPages).not.toHaveBeenCalled();
    });
  });

  describe('getBlockChildren', () => {
    it('returns block children successfully', async () => {
      req.params = { blockId: 'block-123' };
      req.query = { cursor: 'cursor-abc' };

      const mockResponse = { results: [{ id: 'child-1' }], next_cursor: null, has_more: false };
      notionService.listBlockChildrenProxy.mockResolvedValueOnce(mockResponse as any);

      await controller.getBlockChildren(req as Request, res as Response, next);

      expect(notionService.listBlockChildrenProxy).toHaveBeenCalledWith('user-123', 'block-123', 'cursor-abc');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next with ValidationError if blockId is missing', async () => {
      req.params = {}; // blockId 없음

      await controller.getBlockChildren(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      expect(notionService.listBlockChildrenProxy).not.toHaveBeenCalled();
    });
  });
});
