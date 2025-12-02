
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

import { getMe } from '../../src/app/controllers/me';
import { errorHandler } from '../../src/app/middlewares/error';

// Mock getUserIdFromRequest
jest.mock('../../src/app/utils/request', () => ({
  getUserIdFromRequest: jest.fn(),
}));

import { getUserIdFromRequest } from '../../src/app/utils/request';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.get('/v1/me', getMe);
app.use(errorHandler);

describe('MeController', () => {
  const mockGetUserId = getUserIdFromRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 with userId when authenticated', async () => {
    mockGetUserId.mockReturnValue('user-123');

    const res = await request(app).get('/v1/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-123' });
  });

  it('should return 200 with profile when profile cookie exists', async () => {
    mockGetUserId.mockReturnValue('user-123');
    const profile = { displayName: 'Test User', email: 'test@example.com' };
    const cookieVal = Buffer.from(JSON.stringify(profile)).toString('base64url');

    const res = await request(app)
      .get('/v1/me')
      .set('Cookie', [`gn-profile=${cookieVal}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: 'user-123',
      profile: expect.objectContaining(profile),
    });
  });

  it('should ignore invalid profile cookie', async () => {
    mockGetUserId.mockReturnValue('user-123');

    const res = await request(app)
      .get('/v1/me')
      .set('Cookie', ['gn-profile=invalid-base64']);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-123' });
  });

  it('should return 401 when not authenticated', async () => {
    mockGetUserId.mockReturnValue(null); // Simulate no user

    const res = await request(app).get('/v1/me');

    expect(res.status).toBe(401);
    expect(res.body.type).toContain('auth-required');
  });
  
  it('should handle unexpected errors', async () => {
      mockGetUserId.mockImplementation(() => {
          throw new Error('Unexpected error');
      });

      const res = await request(app).get('/v1/me');

      expect(res.status).toBe(500);
      expect(res.body.type).toContain('unknown-error');
  });
});
