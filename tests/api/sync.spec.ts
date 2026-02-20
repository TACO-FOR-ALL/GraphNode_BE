import request from 'supertest';
import express from 'express';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { SyncController } from '../../src/app/controllers/sync';
import { SyncService } from '../../src/core/services/SyncService';
import { getUserIdFromRequest } from '../../src/app/utils/request';
import { errorHandler } from '../../src/app/middlewares/error';
import { SyncPullResponse, SyncPushRequest } from '../../src/shared/dtos/sync';

// Mock dependencies
jest.mock('../../src/core/services/SyncService');
jest.mock('../../src/app/utils/request');

describe('SyncController', () => {
  let app: express.Application;
  let syncController: SyncController;
  let mockSyncService: jest.Mocked<SyncService>;

  let server: any;

  beforeEach((done) => {
    app = express();
    app.use(express.json());

    // Setup mocks
    mockSyncService = {
      pull: jest.fn(),
      push: jest.fn(),
    } as any;
    
    // Manual controller instantiation for isolation
    syncController = new SyncController(mockSyncService);

    // Setup routes
    app.get('/v1/sync/pull', syncController.pull.bind(syncController));
    app.post('/v1/sync/push', syncController.push.bind(syncController));

    // Setup error handler
    app.use(errorHandler);

    // Default mock implementations
    (getUserIdFromRequest as jest.Mock).mockReturnValue('user-1');

    server = app.listen(0, () => done());
  });

  afterEach((done) => {
    jest.clearAllMocks();
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('GET /v1/sync/pull', () => {
    it('should return sync data successfully', async () => {
      const mockResponse: SyncPullResponse = {
        conversations: [],
        messages: [],
        notes: [],
        folders: [],
        serverTime: new Date().toISOString(),
      };

      mockSyncService.pull.mockResolvedValue(mockResponse);

      const res = await request(app)
        .get('/v1/sync/pull')
        .query({ since: '2023-01-01T00:00:00.000Z' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResponse);
      expect(mockSyncService.pull).toHaveBeenCalledWith('user-1', '2023-01-01T00:00:00.000Z');
    });

    it('should handle missing since parameter', async () => {
      const mockResponse: SyncPullResponse = {
        conversations: [],
        messages: [],
        notes: [],
        folders: [],
        serverTime: new Date().toISOString(),
      };

      mockSyncService.pull.mockResolvedValue(mockResponse);

      const res = await request(app).get('/v1/sync/pull');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResponse);
      expect(mockSyncService.pull).toHaveBeenCalledWith('user-1', undefined);
    });

    it('should handle errors from service', async () => {
      mockSyncService.pull.mockRejectedValue(new Error('Service error'));

      const res = await request(app).get('/v1/sync/pull');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('type', 'https://graphnode.dev/problems/unknown-error');
      expect(res.body).toHaveProperty('title', 'UNKNOWN ERROR');
    });
  });

  describe('POST /v1/sync/push', () => {
    const validPushData: SyncPushRequest = {
      conversations: [],
      messages: [],
      notes: [],
      folders: [],
    };

    it('should process push data successfully', async () => {
      mockSyncService.push.mockResolvedValue(undefined);

      const res = await request(app).post('/v1/sync/push').send(validPushData);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockSyncService.push).toHaveBeenCalledWith('user-1', validPushData);
    });

    it('should validate request body (invalid schema)', async () => {
      const invalidData = {
        conversations: 'invalid-type', // Should be array
      };

      const res = await request(app).post('/v1/sync/push').send(invalidData);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('type', 'https://graphnode.dev/problems/validation-failed');
      expect(mockSyncService.push).not.toHaveBeenCalled();
    });

    it('should handle errors from service', async () => {
      mockSyncService.push.mockRejectedValue(new Error('Service error'));

      const res = await request(app).post('/v1/sync/push').send(validPushData);

      expect(res.status).toBe(500);
    });
  });
});
