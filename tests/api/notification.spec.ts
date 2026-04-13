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
import http from 'http';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';
import { NotificationService } from '../../src/core/services/NotificationService';

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
        listMissedNotifications: jest.fn<any>().mockResolvedValue([]),
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
    let server: http.Server;
    let baseUrl: string;
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
        // SSE 테스트는 스트림을 실제로 열어야 하므로,
        // supertest 대신 임시 포트로 서버를 띄워 http.request로 읽습니다.
        server = app.listen(0);
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;

        if (!nock.isActive()) nock.activate();
    });

    afterAll(async () => {
        const { closeDatabases } = require('../../src/infra/db');
        await closeDatabases();
        nock.cleanAll();
        nock.restore();
        server?.close();
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

        it('should replay missed notifications with SSE id/data when authenticated', async () => {
            // 준비(Arrange): NotificationService mock에서 replay 데이터를 주입합니다.
            // (SSE 스트림 연결 직후, controller가 listMissedNotifications를 호출해서 replay를 내려줍니다.)
            const mockedService: any = (NotificationService as unknown as jest.Mock).mock.results[0]?.value;
            expect(mockedService).toBeTruthy();

            mockedService.listMissedNotifications.mockResolvedValue([
                { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', type: 'TEST', payload: { a: 1 }, timestamp: new Date().toISOString() },
                { id: '01ARZ3NDEKTSV4RRFFQ69G5FAW', type: 'TEST', payload: { b: 2 }, timestamp: new Date().toISOString() },
            ]);

            const body = await new Promise<string>((resolve, reject) => {
                // 실행(Act): 실제 SSE 스트림을 열고, CONNECTED + replay id 라인이 들어올 때까지 일부만 읽습니다.
                const req = http.request(
                    `${baseUrl}/v1/notifications/stream?since=cursor_0`,
                    {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            Accept: 'text/event-stream',
                        },
                    },
                    (res) => {
                        let buf = '';
                        res.setEncoding('utf8');
                        res.on('data', (chunk) => {
                            buf += chunk;

                            // We expect:
                            // - CONNECTED event
                            // - replay events with `id:` lines
                            if (
                                buf.includes('"type":"CONNECTED"') &&
                                buf.includes('id: 01ARZ3NDEKTSV4RRFFQ69G5FAV') &&
                                buf.includes('id: 01ARZ3NDEKTSV4RRFFQ69G5FAW')
                            ) {
                                // SSE는 long-lived 연결이므로, 필요한 데이터만 확인되면 스트림을 끊습니다.
                                req.destroy();
                                resolve(buf);
                            }
                        });
                        res.on('error', reject);
                    }
                );

                req.on('error', reject);
                req.end();

                // 안전장치: SSE는 무한 스트림이라 테스트가 영원히 기다리지 않도록 타임아웃을 둡니다.
                setTimeout(() => {
                    try { req.destroy(); } catch {}
                    reject(new Error('Timed out waiting for SSE replay data'));
                }, 3000);
            });

            // 검증(Assert): replay 이벤트가 SSE 표준 id 라인과 함께 내려오는지 확인합니다.
            expect(body).toContain('data: ');
            expect(body).toContain('id: 01ARZ3NDEKTSV4RRFFQ69G5FAV');
            expect(body).toContain('id: 01ARZ3NDEKTSV4RRFFQ69G5FAW');
        });
    });
});
