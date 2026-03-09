/**
 * Notification API 테스트
 *
 * NotificationController의 엔드포인트를 검증합니다.
 * - GET /v1/notifications/stream (SSE 연결)
 * - POST /v1/notifications/device-token (FCM 토큰 등록)
 * - DELETE /v1/notifications/device-token (FCM 토큰 삭제)
 * - POST /v1/notifications/test (테스트 알림 전송)
 */
process.env.AI_SERVER_URI = 'http://mock-ai-server';
process.env.SQS_REQUEST_QUEUE_URL = 'http://mock-queue';
process.env.S3_PAYLOAD_BUCKET = 'mock-bucket';
process.env.SESSION_SECRET = 'test-secret';

import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import nock from 'nock';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';

// --- Mocks ---
jest.mock('../../src/infra/repositories/GraphRepositoryMongo');
jest.mock('../../src/infra/aws/AwsSqsAdapter');
jest.mock('../../src/infra/aws/AwsS3Adapter');
jest.mock('../../src/infra/repositories/ConversationRepositoryMongo');
jest.mock('../../src/infra/repositories/MessageRepositoryMongo');
jest.mock('../../src/infra/repositories/UserRepositoryMySQL');
jest.mock('../../src/infra/db/mongodb', () => ({
    getMongo: jest.fn(() => ({
        startSession: () => ({
            withTransaction: (cb: any) => cb(),
            endSession: jest.fn(),
        }),
    })),
}));
jest.mock('../../src/infra/redis/RedisEventBusAdapter', () => ({
    RedisEventBusAdapter: class {
        publish() { return Promise.resolve(); }
        subscribe() { return Promise.resolve(); }
        unsubscribe() { return Promise.resolve(); }
    }
}));

// NotificationService mock
jest.mock('../../src/core/services/NotificationService', () => ({
    NotificationService: jest.fn().mockImplementation(() => ({
        subscribeToUserNotifications: jest.fn<any>().mockResolvedValue(undefined),
        unsubscribeFromUserNotifications: jest.fn<any>().mockResolvedValue(undefined),
        registerDeviceToken: jest.fn<any>().mockResolvedValue(undefined),
        unregisterDeviceToken: jest.fn<any>().mockResolvedValue(undefined),
        sendNotification: jest.fn<any>().mockResolvedValue(undefined),
    })),
}));

import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

describe('Notification API Integration Tests', () => {
    let app: Express;
    let accessToken: string;
    const userId = 'user-12345';

    beforeAll(async () => {
        (UserRepositoryMySQL as jest.Mock).mockImplementation(() => ({
            findById: jest.fn(async (id: any) => ({
                id: String(id),
                email: 'test@example.com',
                displayName: 'testuser',
                provider: 'google',
                providerUserId: 'google-uid-1',
                preferredLanguage: 'en',
                createdAt: new Date(),
            })),
            findByEmail: jest.fn(async () => null),
        }));

        app = createApp();
        accessToken = generateAccessToken({ userId });

        if (!nock.isActive()) nock.activate();
    });

    afterAll(() => {
        nock.cleanAll();
        nock.restore();
    });

    beforeEach(() => {
        nock.cleanAll();
    });

    // --- POST /v1/notifications/device-token ---
    describe('POST /v1/notifications/device-token', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .post('/v1/notifications/device-token')
                .send({ token: 'fcm-token-123' })
                .expect(401);
        });

        it('should return 400 if token is missing', async () => {
            const res = await request(app)
                .post('/v1/notifications/device-token')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should register device token and return 200', async () => {
            const res = await request(app)
                .post('/v1/notifications/device-token')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ token: 'fcm-token-123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // --- DELETE /v1/notifications/device-token ---
    describe('DELETE /v1/notifications/device-token', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .delete('/v1/notifications/device-token')
                .send({ token: 'fcm-token-123' })
                .expect(401);
        });

        it('should return 400 if token is missing', async () => {
            const res = await request(app)
                .delete('/v1/notifications/device-token')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should unregister device token and return 200', async () => {
            const res = await request(app)
                .delete('/v1/notifications/device-token')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ token: 'fcm-token-123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // --- POST /v1/notifications/test ---
    describe('POST /v1/notifications/test', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .post('/v1/notifications/test')
                .expect(401);
        });

        it('should send test notification and return 200', async () => {
            const res = await request(app)
                .post('/v1/notifications/test')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Test notification');
        });
    });

    // --- GET /v1/notifications/stream (SSE) ---
    // SSE 엔드포인트는 long-lived 연결이므로 supertest로는 전체 플로우 테스트가 어렵습니다.
    // 인증 확인만 수행합니다.
    describe('GET /v1/notifications/stream', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .get('/v1/notifications/stream')
                .expect(401);
        });
    });
});
