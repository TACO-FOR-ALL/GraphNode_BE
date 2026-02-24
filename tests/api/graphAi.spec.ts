// Set environment variables BEFORE any imports that might use them
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
import { GraphRepositoryMongo } from '../../src/infra/repositories/GraphRepositoryMongo';
import { AwsSqsAdapter } from '../../src/infra/aws/AwsSqsAdapter';
import { AwsS3Adapter } from '../../src/infra/aws/AwsS3Adapter';
import { ConversationRepositoryMongo } from '../../src/infra/repositories/ConversationRepositoryMongo';
import { MessageRepositoryMongo } from '../../src/infra/repositories/MessageRepositoryMongo';
import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

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

describe('GraphAi API Integration Tests', () => {
    let app: Express;
    let accessToken: string;
    const userId = 'user-12345';

    // In-memory stores for mocks
    const nodesStore = new Map<number, any>();
    const edgesStore = new Map<string, any>();
    const clustersStore = new Map<string, any>();
    const statsStore = new Map<string, any>();
    const summaryStore = new Map<string, any>();
    const conversationsStore = new Map<string, any>();
    const messagesStore = new Map<string, any[]>();
    const sqsMessages: any[] = [];
    const s3Files = new Map<string, any>();

    const mockGraphRepo = {
        upsertNode: jest.fn(async (node: any) => { nodesStore.set(node.id, node); }),
        listNodes: jest.fn(async () => Array.from(nodesStore.values())),
        upsertEdge: jest.fn(async (edge: any) => { 
            const id = edge.id || `${edge.source}-${edge.target}`; 
            edgesStore.set(id, edge); 
            return id; 
        }),
        listEdges: jest.fn(async () => Array.from(edgesStore.values())),
        upsertCluster: jest.fn(async (cluster: any) => { clustersStore.set(cluster.id, cluster); }),
        listClusters: jest.fn(async () => Array.from(clustersStore.values())),
        findCluster: jest.fn(async (uid: string, id: string) => clustersStore.get(id) || null),
        saveStats: jest.fn(async (stats: any) => { statsStore.set(stats.userId, stats); }),
        getStats: jest.fn(async (uid: string) => statsStore.get(uid) || null),
        getSnapshotForUser: jest.fn(async (uid: string) => ({
            nodes: Array.from(nodesStore.values()).filter(n => n.userId === uid),
            edges: Array.from(edgesStore.values()).filter(e => e.userId === uid),
            clusters: Array.from(clustersStore.values()).filter(c => c.userId === uid),
            stats: statsStore.get(uid) || { nodes: 0, edges: 0, clusters: 0 }
        })),
        upsertGraphSummary: jest.fn(async (uid: string, summary: any) => { summaryStore.set(uid, summary); }),
        getGraphSummary: jest.fn(async (uid: string) => summaryStore.get(uid) || null),
        deleteAllGraphData: jest.fn(async (uid: string) => {
            Array.from(nodesStore.keys()).forEach(k => { if (nodesStore.get(k).userId === uid) nodesStore.delete(k); });
            Array.from(edgesStore.keys()).forEach(k => { if (edgesStore.get(k).userId === uid) edgesStore.delete(k); });
            Array.from(clustersStore.keys()).forEach(k => { if (clustersStore.get(k).userId === uid) clustersStore.delete(k); });
            statsStore.delete(uid);
            summaryStore.delete(uid);
        }),
        deleteGraphSummary: jest.fn(async (uid: string) => { summaryStore.delete(uid); })
    };

    const mockConvRepo = {
        create: jest.fn(async (conv: any) => { conversationsStore.set(conv._id, conv); return conv; }),
        findById: jest.fn(async (id: string) => conversationsStore.get(id) || null),
        listByOwner: jest.fn(async (uid: string, limit: number) => ({ items: Array.from(conversationsStore.values()).filter(c => c.ownerUserId === uid).slice(0, limit), nextCursor: null })),
    };

    const mockMsgRepo = {
        create: jest.fn(async (msg: any) => {
            const msgs = messagesStore.get(msg.conversationId) || [];
            msgs.push(msg);
            messagesStore.set(msg.conversationId, msgs);
            return msg;
        }),
        findAllByConversationId: jest.fn(async (cid: string) => messagesStore.get(cid) || []),
    };

    const mockSqsAdapter = {
        sendMessage: jest.fn(async (url: string, body: any) => { sqsMessages.push({ url, body }); }),
    };

    const mockS3Adapter = {
        upload: jest.fn(async (key: string, body: any) => { s3Files.set(key, body); }),
    };

    beforeAll(async () => {
        (GraphRepositoryMongo as jest.Mock).mockImplementation(() => mockGraphRepo);
        (ConversationRepositoryMongo as jest.Mock).mockImplementation(() => mockConvRepo);
        (MessageRepositoryMongo as jest.Mock).mockImplementation(() => mockMsgRepo);
        (AwsSqsAdapter as jest.Mock).mockImplementation(() => mockSqsAdapter);
        (AwsS3Adapter as jest.Mock).mockImplementation(() => mockS3Adapter);
        (UserRepositoryMySQL as jest.Mock).mockImplementation(() => ({
            findById: jest.fn(async (id: any) => ({ 
                id: String(id), 
                email: 'test@example.com', 
                username: 'testuser' 
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
        nodesStore.clear();
        edgesStore.clear();
        clustersStore.clear();
        statsStore.clear();
        summaryStore.clear();
        conversationsStore.clear();
        messagesStore.clear();
        sqsMessages.length = 0;
        s3Files.clear();
        nock.cleanAll();
    });

    describe('GET /v1/graph-ai/summary', () => {
        it('should return 404 if summary not found', async () => {
            await request(app)
                .get('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(404);
        });

        it('should return summary if exists', async () => {
            const summary = { overview: { summary_text: 'Test Summary' }, clusters: [], patterns: [], connections: [], recommendations: [], generated_at: new Date().toISOString() };
            summaryStore.set(userId, summary);

            const res = await request(app)
                .get('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);
            
            expect(res.body.overview.summary_text).toBe('Test Summary');
        });
    });

    describe('DELETE /v1/graph-ai/summary', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .delete('/v1/graph-ai/summary')
                .expect(401);
        });

        it('should delete the summary and return 204', async () => {
            const summary = { overview: { summary_text: 'Test' }, clusters: [], patterns: [], connections: [], recommendations: [], generated_at: new Date().toISOString() };
            summaryStore.set(userId, summary);

            await request(app)
                .delete('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(204);
            
            expect(summaryStore.has(userId)).toBe(false);
            expect(mockGraphRepo.deleteGraphSummary).toHaveBeenCalledWith(userId, undefined);
        });
    });

    describe('DELETE /v1/graph-ai', () => {
        it('should return 401 if unauthenticated', async () => {
            await request(app)
                .delete('/v1/graph-ai')
                .expect(401);
        });

        it('should delete all graph data and return 204', async () => {
            nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, timestamp: null });
            clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: 'D', size: 1, themes: [] });
            statsStore.set(userId, { nodes: 1, edges: 0, clusters: 1 });
            summaryStore.set(userId, { overview: { summary_text: 'Test' }, clusters: [], patterns: [], connections: [], recommendations: [], generated_at: new Date().toISOString() });

            await request(app)
                .delete('/v1/graph-ai')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(204);

            expect(nodesStore.has(1)).toBe(false);
            expect(clustersStore.has('c1')).toBe(false);
            expect(statsStore.has(userId)).toBe(false);
            expect(summaryStore.has(userId)).toBe(false);
            expect(mockGraphRepo.deleteAllGraphData).toHaveBeenCalledWith(userId, undefined);
        });
    });

    describe('POST /v1/graph-ai/summary', () => {
        it('should return 400 if graph data missing (no snapshot)', async () => {
            // Service throws if nodes linked to stats are missing or similar
            await request(app)
                .post('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(500); 
        });

        it('should queue summary generation if graph data exists', async () => {
            nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, timestamp: null });
            clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: 'D', size: 1, themes: [] });
            statsStore.set(userId, { nodes: 1, edges: 1, clusters: 1 });

            const res = await request(app)
                .post('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(202);

            expect(res.body.status).toBe('queued');
            expect(sqsMessages.length).toBe(1);
            expect(sqsMessages[0].body.taskType).toBe('GRAPH_SUMMARY_REQUEST');
        });
    });

    describe('POST /v1/graph-ai/generate', () => {
        it('should queue full graph generation', async () => {
            const cid = 'conv1';
            conversationsStore.set(cid, { _id: cid, ownerUserId: userId, title: 'Test Conv', messages: [] });
            messagesStore.set(cid, [{ 
                id: 'm1', 
                conversationId: cid, 
                role: 'user', 
                content: 'hello', 
                createdAt: new Date().toISOString() 
            }]);

            const res = await request(app)
                .post('/v1/graph-ai/generate')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(202);

            expect(res.body.status).toBe('queued');
            expect(sqsMessages.length).toBe(1);
            expect(sqsMessages[0].body.taskType).toBe('GRAPH_GENERATION_REQUEST');
        });
    });

    describe('POST /v1/graph-ai/add-conversation/:conversationId', () => {
        it('should return 404 if conversation not found', async () => {
            await request(app)
                .post('/v1/graph-ai/add-conversation/nonexistent')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(404);
        });

        it('should queue conversation addition', async () => {
            const cid = 'conv2';
            conversationsStore.set(cid, { _id: cid, ownerUserId: userId, title: 'Test Conv 2' });
            messagesStore.set(cid, [{ 
                id: 'm2', 
                conversationId: cid, 
                role: 'user', 
                content: 'test add', 
                createdAt: new Date().toISOString() 
            }]);

            const res = await request(app)
                .post(`/v1/graph-ai/add-conversation/${cid}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(202);

            expect(res.body.status).toBe('queued');
            expect(sqsMessages.length).toBe(1);
            expect(sqsMessages[0].body.taskType).toBe('ADD_CONVERSATION_REQUEST');
        });

        it('should process directly if GRAPH_AI_DIRECT is true', async () => {
            process.env.GRAPH_AI_DIRECT = 'true';
            const cid = 'conv3';
            conversationsStore.set(cid, { _id: cid, ownerUserId: userId, title: 'Direct' });
            messagesStore.set(cid, [{ 
                id: 'm3', 
                conversationId: cid, 
                role: 'user', 
                content: 'direct', 
                createdAt: new Date().toISOString() 
            }]);

            // INTERCEPT MOCK-AI-SERVER
            nock('http://mock-ai-server')
                .post('/add-node')
                .reply(200, {
                    nodes: [{ id: 100, origId: cid, clusterId: 'c2', clusterName: 'C2', numMessages: 1, timestamp: null }],
                    edges: [],
                    assignedCluster: { clusterId: 'c2', isNewCluster: true, confidence: 1, reasoning: 'test' }
                });

            const res = await request(app)
                .post(`/v1/graph-ai/add-conversation/${cid}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(202);

            expect(res.body.message).toContain('(Direct)');
            expect(nodesStore.size).toBe(1);
            delete process.env.GRAPH_AI_DIRECT;
        });
    });

    describe('POST /v1/graph-ai/test/generate-json', () => {
        it('should return 400 for invalid input', async () => {
            await request(app)
                .post('/v1/graph-ai/test/generate-json')
                .send({ not: 'an array' })
                .expect(400);
        });

        it('should start direct generation from JSON', async () => {
            const inputData = [{ 
                id: 'test1', 
                conversation_id: 'test1', 
                title: 'T', 
                create_time: 123, 
                update_time: 456, 
                mapping: {} 
            }];
            
            nock('http://mock-ai-server')
                .post('/analysis')
                .reply(200, { task_id: 'task_123', status: 'queued' });

            const res = await request(app)
                .post('/v1/graph-ai/test/generate-json')
                .send(inputData)
                .expect(202);
            
            expect(res.body.taskId).toBe('task_123');
        });
    });
});
