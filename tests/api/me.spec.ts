
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

import { errorHandler } from '../../src/app/middlewares/error';
import { createMeRouter } from '../../src/app/routes/me';
import { UserService } from '../../src/core/services/UserService';
import { getUserIdFromRequest } from '../../src/app/utils/request';
import { AuthError, NotFoundError } from '../../src/shared/errors/domain';

// Mock dependencies
jest.mock('../../src/core/services/UserService');
jest.mock('../../src/app/utils/request');
jest.mock('../../src/app/middlewares/session', () => ({
  bindSessionUser: (req: any, res: any, next: any) => next(),
}));
jest.mock('../../src/app/middlewares/auth', () => ({
  requireLogin: (req: any, res: any, next: any) => {
    // Simulate requireLogin by checking if a mock user is set
    if (getUserIdFromRequest(req)) {
      return next();
    }
    // This is a simplified mock. In a real scenario, it would throw an AuthError.
    // For this test, we let the controller handle the null userId.
    // The AuthError is tested in the middleware's own spec.
    if (getUserIdFromRequest(req)) {
        return next();
    }
    throw new AuthError('Authentication required');
  },
}));


describe('MeController', () => {
  let app: express.Application;
  let mockUserService: jest.Mocked<UserService>;
  const mockGetUserId = getUserIdFromRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserService = new UserService(null as any) as jest.Mocked<UserService>;

    const meRouter = createMeRouter({
      userService: mockUserService,
    });

    app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/v1/me', meRouter);
    app.use(errorHandler);
  });

  it('should return 200 with user profile when authenticated', async () => {
    const userId = '1';
    const userProfile = { id: userId, displayName: 'Test User', email: 'test@example.com', avatarUrl: null };
    mockGetUserId.mockReturnValue(userId);
    mockUserService.getUserProfile.mockResolvedValue(userProfile);

    const res = await request(app).get('/v1/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: userProfile.id, profile: userProfile });
    expect(mockUserService.getUserProfile).toHaveBeenCalledWith(userId);
  });

  it('should return 401 when getUserIdFromRequest throws AuthError', async () => {
    mockGetUserId.mockImplementation(() => {
      throw new AuthError('Authentication required');
    });

    const res = await request(app).get('/v1/me');
    
    expect(res.status).toBe(401); 
    expect(res.body.type).toContain('auth-required');
  });
  
  it('should return 404 when user is not found', async () => {
    const userId = '999';
    mockGetUserId.mockReturnValue(userId);
    mockUserService.getUserProfile.mockRejectedValue(new NotFoundError('User not found'));

    const res = await request(app).get('/v1/me');

    expect(res.status).toBe(404);
    expect(res.body.type).toContain('not-found');
  });

  it('should handle unexpected errors from the service', async () => {
      const userId = '1';
      mockGetUserId.mockReturnValue(userId);
      mockUserService.getUserProfile.mockRejectedValue(new Error('Unexpected DB error'));

      const res = await request(app).get('/v1/me');

      expect(res.status).toBe(500);
      expect(res.body.type).toContain('unknown-error');
  });
});
