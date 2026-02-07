import { Request, Response, NextFunction } from 'express';

import { requestContext } from '../../src/app/middlewares/request-context';
import { requireLogin } from '../../src/app/middlewares/auth';
import { requestStore } from '../../src/shared/context/requestStore';

// Mock requestStore
jest.mock('../../src/shared/context/requestStore', () => ({
  requestStore: {
    run: jest.fn((ctx, cb) => cb()),
  },
}));

describe('Middlewares', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      header: jest.fn(),
      get: jest.fn(),
    };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('requestContext', () => {
    it('should generate correlationId if not present', () => {
      (req.header as jest.Mock).mockReturnValue(undefined);

      requestContext(req as Request, res as Response, next);

      expect(requestStore.run).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: expect.any(String),
        }),
        expect.any(Function)
      );
      expect(next).toHaveBeenCalled();
    });

    it('should use existing correlationId from traceparent', () => {
      (req.header as jest.Mock).mockReturnValue('00-1234567890abcdef-00');

      requestContext(req as Request, res as Response, next);

      expect(requestStore.run).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: '1234567890abcdef',
        }),
        expect.any(Function)
      );
      expect(next).toHaveBeenCalled();
    });

    it('should extract userId from session', () => {
      (req as any).userId = 'u_123';

      requestContext(req as Request, res as Response, next);

      expect(requestStore.run).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u_123',
        }),
        expect.any(Function)
      );
    });
  });

  describe('requireLogin', () => {
    it('should call next if userId is present', () => {
      (req as any).userId = 'u_1';

      requireLogin(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next even if userId is missing (pass-through)', () => {
      (req as any).userId = undefined;

      requireLogin(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

});
