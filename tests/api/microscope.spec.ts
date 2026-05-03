/**
 * Microscope API 테스트
 *
 * MicroscopeController의 모든 엔드포인트를 검증합니다.
 * - POST /v1/microscope/nodes/ingest (노드 기반 워크스페이스 생성)
 * - GET /v1/microscope (워크스페이스 목록)
 * - GET /v1/microscope/:groupId (워크스페이스 상세)
 * - GET /v1/microscope/:groupId/graph (그래프 데이터)
 * - GET /v1/microscope/nodes/:nodeId/latest-workspace (노드 기반 최신 Ingest 워크스페이스, status 추적용)
 * - GET /v1/microscope/nodes/:nodeId/latest-graph (노드 기반 최신 그래프)
 * - DELETE /v1/microscope/:groupId (삭제)
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
jest.mock('../../src/infra/graph/Neo4jMacroGraphAdapter');
jest.mock('../../src/infra/aws/AwsSqsAdapter');
jest.mock('../../src/infra/aws/AwsS3Adapter');
jest.mock('../../src/infra/repositories/ConversationRepositoryMongo');
jest.mock('../../src/infra/repositories/MessageRepositoryMongo');
jest.mock('../../src/infra/repositories/UserRepositoryMySQL');
jest.mock('../../src/infra/repositories/MicroscopeWorkspaceRepositoryMongo');
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

// MicroscopeManagementService mock
jest.mock('../../src/core/services/MicroscopeManagementService', () => ({
    MicroscopeManagementService: jest.fn().mockImplementation(() => ({
        createWorkspaceAndMicroscopeIngestFromNode: jest.fn<any>().mockResolvedValue({
            _id: 'ws-1',
            userId: 'user-12345',
            groupId: 'group-1',
            nodeId: 'node-1',
            nodeType: 'conversation',
            status: 'PROCESSING',
            createdAt: new Date().toISOString(),
        }),
        listWorkspaces: jest.fn<any>().mockResolvedValue([
            { _id: 'ws-1', groupId: 'group-1', status: 'COMPLETED' },
            { _id: 'ws-2', groupId: 'group-2', status: 'PROCESSING' },
        ]),
        getWorkspaceActivity: jest.fn<any>().mockResolvedValue({
            _id: 'ws-1',
            groupId: 'group-1',
            status: 'COMPLETED',
            nodes: [],
            edges: [],
        }),
        getWorkspaceGraph: jest.fn<any>().mockResolvedValue({
            nodes: [{ id: 1, label: 'Node 1' }],
            edges: [{ source: 1, target: 2 }],
        }),
        getLatestWorkspaceByNodeId: jest.fn<any>().mockResolvedValue({
            _id: 'ws-1',
            userId: 'user-12345',
            name: 'Test Note',
            documents: [
                {
                    id: 'doc-1',
                    s3Key: '',
                    fileName: 'note-1.md',
                    status: 'PROCESSING',
                    nodeId: 'node-1',
                    nodeType: 'note',
                    createdAt: '2026-04-09T10:00:00Z',
                    updatedAt: '2026-04-09T10:00:00Z',
                },
            ],
            createdAt: '2026-04-09T10:00:00Z',
            updatedAt: '2026-04-09T10:00:00Z',
        }),
        getLatestGraphByNodeId: jest.fn<any>().mockResolvedValue({
            nodes: [{ id: 1, label: 'Latest Node' }],
            edges: [],
        }),
        deleteWorkspace: jest.fn<any>().mockResolvedValue(undefined),
    })),
}));

import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

describe('Microscope API Integration Tests', () => {
    let app: Express;
    let server: import('http').Server;
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
        server = app.listen(0);
        accessToken = generateAccessToken({ userId });

        if (!nock.isActive()) nock.activate();
    });

    afterAll(async () => {
        const { closeDatabases } = require('../../src/infra/db');
        await closeDatabases();
        nock.cleanAll();
        nock.restore();
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server.close((err?: Error) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    });

    beforeEach(() => {
        nock.cleanAll();
    });

    // --- POST /v1/microscope/nodes/ingest ---
    describe('POST /v1/microscope/nodes/ingest', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .post('/v1/microscope/nodes/ingest')
                .send({ nodeId: 'n1', nodeType: 'conversation' })
                .expect(401);
        });

        it('should return 400 if nodeId is missing', async () => {
            const res = await request(app)
                .post('/v1/microscope/nodes/ingest')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ nodeType: 'conversation' });

            expect(res.status).toBe(400);
            expect(res.body.detail).toContain('nodeId');
        });

        it('should return 400 if nodeType is missing', async () => {
            const res = await request(app)
                .post('/v1/microscope/nodes/ingest')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ nodeId: 'n1' });

            expect(res.status).toBe(400);
            expect(res.body.detail).toContain('nodeType');
        });

        it('should create workspace and return 201', async () => {
            const res = await request(app)
                .post('/v1/microscope/nodes/ingest')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ nodeId: 'node-1', nodeType: 'conversation' });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('groupId');
            expect(res.body.status).toBe('PROCESSING');
        });
    });

    // --- GET /v1/microscope ---
    describe('GET /v1/microscope', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .get('/v1/microscope')
                .expect(401);
        });

        it('should return workspace list', async () => {
            const res = await request(app)
                .get('/v1/microscope')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(2);
        });
    });

    // --- GET /v1/microscope/:groupId ---
    describe('GET /v1/microscope/:groupId', () => {
        it('should return workspace details', async () => {
            const res = await request(app)
                .get('/v1/microscope/group-1')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body).toHaveProperty('groupId', 'group-1');
        });
    });

    // --- GET /v1/microscope/:groupId/graph ---
    describe('GET /v1/microscope/:groupId/graph', () => {
        it('should return graph data', async () => {
            const res = await request(app)
                .get('/v1/microscope/group-1/graph')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body).toHaveProperty('nodes');
            expect(res.body).toHaveProperty('edges');
            expect(res.body.nodes.length).toBeGreaterThan(0);
        });
    });

    // --- GET /v1/microscope/nodes/:nodeId/latest-workspace ---
    describe('GET /v1/microscope/nodes/:nodeId/latest-workspace', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .get('/v1/microscope/nodes/node-1/latest-workspace')
                .expect(401);
        });

        it('should return 200 with workspace metadata when found', async () => {
            const res = await request(app)
                .get('/v1/microscope/nodes/node-1/latest-workspace')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body).toHaveProperty('_id', 'ws-1');
            expect(res.body).toHaveProperty('documents');
            expect(Array.isArray(res.body.documents)).toBe(true);
            const doc = res.body.documents.find((d: any) => d.nodeId === 'node-1');
            expect(doc).toBeDefined();
            expect(doc.status).toBe('PROCESSING');
        });

        it('should return 404 when no workspace exists for nodeId', async () => {
            const { MicroscopeManagementService } = require('../../src/core/services/MicroscopeManagementService');
            const mockInstance = (MicroscopeManagementService as jest.Mock).mock.results[0].value as any;
            mockInstance.getLatestWorkspaceByNodeId.mockRejectedValueOnce(
                Object.assign(new Error('Not found'), { statusCode: 404, code: 'NOT_FOUND' })
            );

            await request(app)
                .get('/v1/microscope/nodes/nonexistent-node/latest-workspace')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(404);
        });
    });

    // --- GET /v1/microscope/nodes/:nodeId/latest-graph ---
    describe('GET /v1/microscope/nodes/:nodeId/latest-graph', () => {
        it('should return latest graph for node', async () => {
            const res = await request(app)
                .get('/v1/microscope/nodes/node-1/latest-graph')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body).toHaveProperty('nodes');
            expect(res.body.nodes[0].label).toBe('Latest Node');
        });
    });

    // --- DELETE /v1/microscope/:groupId ---
    describe('DELETE /v1/microscope/:groupId', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .delete('/v1/microscope/group-1')
                .expect(401);
        });

        it('should delete workspace and return 204', async () => {
            await request(app)
                .delete('/v1/microscope/group-1')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(204);
        });
    });
});
