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
import { NoteRepositoryMongo } from '../../src/infra/repositories/NoteRepositoryMongo';
import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

// --- Mocks ---
jest.mock('../../src/infra/repositories/GraphRepositoryMongo');
jest.mock('../../src/infra/aws/AwsSqsAdapter');
jest.mock('../../src/infra/aws/AwsS3Adapter');
jest.mock('../../src/infra/repositories/ConversationRepositoryMongo');
jest.mock('../../src/infra/repositories/MessageRepositoryMongo');
jest.mock('../../src/infra/repositories/NoteRepositoryMongo');
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

// GraphAi 테스트는 큐잉만 검증. 알림 전송 시 NotificationService가 Mongo insert를 시도하는데,
// 이 스펙의 Mongo mock은 db().collection()을 지원하지 않아 502가 난다. 따라서 NotificationService를 mock.
jest.mock('../../src/core/services/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    sendGraphGenerationRequested: jest.fn<any>().mockResolvedValue(undefined),
    sendGraphGenerationRequestFailed: jest.fn<any>().mockResolvedValue(undefined),
    sendGraphSummaryRequested: jest.fn<any>().mockResolvedValue(undefined),
    sendGraphSummaryRequestFailed: jest.fn<any>().mockResolvedValue(undefined),
    sendNotification: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

describe('GraphAi API Integration Tests', () => {
    let app: Express;
    let server: import('http').Server;
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
        listSubclusters: jest.fn(async () => []),
        findCluster: jest.fn(async (uid: string, id: string) => clustersStore.get(id) || null),
        saveStats: jest.fn(async (stats: any) => { statsStore.set(stats.userId, stats); }),
        getStats: jest.fn(async (uid: string) => statsStore.get(uid) || null),
        getSnapshotForUser: jest.fn(async (uid: string) => ({
            nodes: Array.from(nodesStore.values()).filter(n => n.userId === uid),
            edges: Array.from(edgesStore.values()).filter(e => e.userId === uid),
            clusters: Array.from(clustersStore.values()).filter(c => c.userId === uid),
            stats: statsStore.get(uid) || { id: uid, userId: uid, nodes: 0, edges: 0, clusters: 0, status: 'NOT_CREATED', generatedAt: '', metadata: {} }
        })),
        upsertGraphSummary: jest.fn(async (uid: string, summary: any) => { summaryStore.set(uid, summary); }),
        getGraphSummary: jest.fn(async (uid: string) => summaryStore.get(uid) || null),
        deleteAllGraphData: jest.fn(async (uid: string, permanent?: boolean, options?: any) => {
            Array.from(nodesStore.keys()).forEach(k => { if (nodesStore.get(k).userId === uid) nodesStore.delete(k); });
            Array.from(edgesStore.keys()).forEach(k => { if (edgesStore.get(k).userId === uid) edgesStore.delete(k); });
            Array.from(clustersStore.keys()).forEach(k => { if (clustersStore.get(k).userId === uid) clustersStore.delete(k); });
            statsStore.delete(uid);
            summaryStore.delete(uid);
        }),
        deleteGraphSummary: jest.fn(async (uid: string, permanent?: boolean, options?: any) => { summaryStore.delete(uid); })
    };

    const mockConvRepo = {
        create: jest.fn(async (conv: any) => { conversationsStore.set(conv._id, conv); return conv; }),
        countByOwner: jest.fn(async (uid: string) => Array.from(conversationsStore.values()).filter(c => c.ownerUserId === uid).length),
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
        findAllByConversationIds: jest.fn(async (cids: string[]) => {
            const result: any[] = [];
            cids.forEach(cid => {
                const msgs = messagesStore.get(cid) || [];
                result.push(...msgs);
            });
            return result;
        }),
        deleteAllByUserId: jest.fn(async (uid: string) => {
            let count = 0;
            for (const [cid, msgs] of messagesStore.entries()) {
                const filtered = msgs.filter(m => m.ownerUserId !== uid);
                count += (msgs.length - filtered.length);
                if (filtered.length === 0) messagesStore.delete(cid);
                else messagesStore.set(cid, filtered);
            }
            return count;
        }),
    };

    const mockSqsAdapter = {
        sendMessage: jest.fn(async (url: string, body: any) => { sqsMessages.push({ url, body }); }),
    };

    const notesStore = new Map<string, any>();
    const mockNoteRepo = {
        createNote: jest.fn(async (note: any) => { notesStore.set(note._id, note); return note; }),
        countByOwner: jest.fn(async (uid: string) => Array.from(notesStore.values()).filter(n => n.ownerUserId === uid).length),
        findNotesModifiedSince: jest.fn(async (uid: string, since: Date) => Array.from(notesStore.values()).filter(n => n.ownerUserId === uid)),
        listNotes: jest.fn(async (uid: string, folderId: string | null, limit: number) => ({ items: Array.from(notesStore.values()).filter(n => n.ownerUserId === uid).slice(0, limit), nextCursor: null })),
        deleteAllNotes: jest.fn(async (uid: string) => { 
            let count = 0;
            for (const [id, note] of notesStore.entries()) {
                if (note.ownerUserId === uid) { notesStore.delete(id); count++; }
            }
            return count;
        }),
        deleteAllFolders: jest.fn(async (uid: string) => 0),
    };

    const mockS3Adapter = {
        upload: jest.fn(async (key: string, body: any) => { s3Files.set(key, body); }),
    };

    beforeAll(async () => {
        (GraphRepositoryMongo as jest.Mock).mockImplementation(() => mockGraphRepo);
        (ConversationRepositoryMongo as jest.Mock).mockImplementation(() => mockConvRepo);
        (MessageRepositoryMongo as jest.Mock).mockImplementation(() => mockMsgRepo);
        (NoteRepositoryMongo as jest.Mock).mockImplementation(() => mockNoteRepo);
        (AwsSqsAdapter as jest.Mock).mockImplementation(() => mockSqsAdapter);
        (AwsS3Adapter as jest.Mock).mockImplementation(() => mockS3Adapter);
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
        server = app.listen(0); // Listen on random port for test isolation
        accessToken = generateAccessToken({ userId });

        if (!nock.isActive()) nock.activate();
    });

    afterAll(async () => {
        nock.cleanAll();
        nock.restore();
        
        const { closeDatabases } = require('../../src/infra/db');
        await closeDatabases();

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
        nodesStore.clear();
        edgesStore.clear();
        clustersStore.clear();
        statsStore.clear();
        summaryStore.clear();
        conversationsStore.clear();
        messagesStore.clear();
        sqsMessages.length = 0;
        s3Files.clear();
        notesStore.clear();
        nock.cleanAll();
    });

    describe('GET /v1/graph-ai/summary', () => {
        it('should return default summary if summary not found', async () => {
            const res = await request(app)
                .get('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);
            
            expect(res.body.overview.total_conversations).toBe(0);
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
            expect(mockGraphRepo.deleteGraphSummary.mock.calls[0][0]).toBe(userId);
            expect(mockGraphRepo.deleteGraphSummary.mock.calls[0][1]).toBe(true);
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
            statsStore.set(userId, { id: userId, userId, nodes: 1, edges: 0, clusters: 1, status: 'CREATED', generatedAt: '', metadata: {} });
            summaryStore.set(userId, { overview: { summary_text: 'Test' }, clusters: [], patterns: [], connections: [], recommendations: [], generated_at: new Date().toISOString() });

            await request(app)
                .delete('/v1/graph-ai')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(204);

            expect(nodesStore.has(1)).toBe(false);
            expect(clustersStore.has('c1')).toBe(false);
            expect(statsStore.has(userId)).toBe(false);
            expect(summaryStore.has(userId)).toBe(false);
            expect(mockGraphRepo.deleteAllGraphData.mock.calls[0][0]).toBe(userId);
            expect(mockGraphRepo.deleteAllGraphData.mock.calls[0][1]).toBe(true);
        });
    });

    describe('POST /v1/graph-ai/summary', () => {
        it('should return 404 if graph data missing (no snapshot)', async () => {
            // Service throws if nodes linked to stats are missing or similar
            const res = await request(app)
                .post('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(404);
        });

        it('should queue summary generation if graph data exists', async () => {
            nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, timestamp: null });
            clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: 'D', size: 1, themes: [] });
            statsStore.set(userId, { id: userId, userId, nodes: 1, edges: 1, clusters: 1, status: 'CREATED', generatedAt: '', metadata: {} });

            const res = await request(app)
                .post('/v1/graph-ai/summary')
                .set('Authorization', `Bearer ${accessToken}`);
            if (res.status !== 202) console.error('RES BODY SUMMARY:', res.body);
            expect(res.status).toBe(202);

            expect(res.body.status).toBe('queued');
            expect(sqsMessages.length).toBe(1);
            expect(sqsMessages[0].body.taskType).toBe('GRAPH_SUMMARY_REQUEST');
        });
    });

    describe('POST /v1/graph-ai/generate', () => {
        it('should return 200 skipped if no conversations and no notes exist', async () => {
            const res = await request(app)
                .post('/v1/graph-ai/generate')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);
            
            expect(res.body.status).toBe('skipped');
            expect(res.body.message).toContain('No conversation or note data found');
            expect(sqsMessages.length).toBe(0);
        });

        it('should queue full graph generation', async () => {
            const cid = 'conv1';
            const now = Date.now();
            conversationsStore.set(cid, { 
                _id: cid, 
                ownerUserId: userId, 
                title: 'Test Conv', 
                createdAt: now,
                updatedAt: now,
                messages: [] 
            });
            messagesStore.set(cid, [{ 
                _id: 'm1', 
                conversationId: cid, 
                ownerUserId: userId,
                role: 'user', 
                content: 'hello', 
                createdAt: now,
                updatedAt: now
            }]);

            const res = await request(app)
                .post('/v1/graph-ai/generate')
                .set('Authorization', `Bearer ${accessToken}`);
            if (res.status !== 202) console.error('RES BODY GENERATE:', res.body);
            expect(res.status).toBe(202);

            expect(res.body.status).toBe('queued');
            expect(sqsMessages.length).toBe(1);
            expect(sqsMessages[0].body.taskType).toBe('GRAPH_GENERATION_REQUEST');
        });
    });
})
