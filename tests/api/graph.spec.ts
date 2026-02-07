/**
 * 목적: Graph HTTP API의 동작을 실서비스(GraphEmbeddingService)와 가상 저장소(Mock Repository)를 사용하여 검증한다.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';
import { 
    GraphNodeDoc, 
    GraphEdgeDoc, 
    GraphClusterDoc, 
    GraphSubclusterDoc, 
    GraphStatsDoc, 
    GraphSummaryDoc 
} from '../../src/core/types/persistence/graph.persistence';

// --- 전역 인메모리 스토어 ---
let nodesStore = new Map<number, GraphNodeDoc>();
let edgesStore = new Map<string, GraphEdgeDoc>();
let clustersStore = new Map<string, GraphClusterDoc>();
let subclustersStore = new Map<string, GraphSubclusterDoc>();
let statsStore = new Map<string, GraphStatsDoc>();
let summaryStore = new Map<string, GraphSummaryDoc>();

// --- GraphRepository Mock ---
jest.mock('../../src/infra/repositories/GraphRepositoryMongo', () => ({
  GraphRepositoryMongo: class {
    // --- Node Operations ---
    async upsertNode(doc: GraphNodeDoc) {
      nodesStore.set(doc.id, { ...doc });
    }
    async updateNode(userId: string, id: number, patch: Partial<GraphNodeDoc>) {
      const n = nodesStore.get(id);
      if (n && n.userId === userId) {
        nodesStore.set(id, { ...n, ...patch, updatedAt: new Date().toISOString() });
      }
    }
    async deleteNode(userId: string, id: number) {
      const n = nodesStore.get(id);
      if (n && n.userId === userId) {
        nodesStore.delete(id);
        // Cascade delete edges (simplified mock logic)
        for (const [eid, e] of edgesStore.entries()) {
            if (e.userId === userId && (e.source === id || e.target === id)) {
                edgesStore.delete(eid);
            }
        }
      }
    }
    async deleteNodes(userId: string, ids: number[]) {
        for (const id of ids) await this.deleteNode(userId, id);
    }
    async findNode(userId: string, id: number) {
      const n = nodesStore.get(id);
      return (n && n.userId === userId) ? n : null;
    }
    async listNodes(userId: string) {
      return Array.from(nodesStore.values()).filter(n => n.userId === userId);
    }
    async listNodesByCluster(userId: string, clusterId: string) {
      return Array.from(nodesStore.values()).filter(n => n.userId === userId && n.clusterId === clusterId);
    }

    // --- Edge Operations ---
    async upsertEdge(doc: GraphEdgeDoc) {
      edgesStore.set(doc.id, { ...doc });
      return doc.id;
    }
    async deleteEdge(userId: string, edgeId: string) {
      const e = edgesStore.get(edgeId);
      if (e && e.userId === userId) edgesStore.delete(edgeId);
    }
    async deleteEdgeBetween(userId: string, source: number, target: number) {
        for (const [id, e] of edgesStore.entries()) {
            if (e.userId === userId && e.source === source && e.target === target) {
                edgesStore.delete(id);
            }
        }
    }
    async deleteEdgesByNodeIds(userId: string, ids: number[]) {
        for (const [eid, e] of edgesStore.entries()) {
            if (e.userId === userId && (ids.includes(e.source) || ids.includes(e.target))) {
                edgesStore.delete(eid);
            }
        }
    }
    async listEdges(userId: string) {
      return Array.from(edgesStore.values()).filter(e => e.userId === userId);
    }

    // --- Cluster Operations ---
    async upsertCluster(doc: GraphClusterDoc) {
      clustersStore.set(doc.id, { ...doc });
    }
    async deleteCluster(userId: string, clusterId: string) {
      const c = clustersStore.get(clusterId);
      if (c && c.userId === userId) clustersStore.delete(clusterId);
    }
    async findCluster(userId: string, clusterId: string) {
      const c = clustersStore.get(clusterId);
      return (c && c.userId === userId) ? c : null;
    }
    async listClusters(userId: string) {
      return Array.from(clustersStore.values()).filter(c => c.userId === userId);
    }

    // --- Subclusters ---
    async upsertSubcluster(doc: GraphSubclusterDoc) {
        subclustersStore.set(doc.id, { ...doc });
    }
    async deleteSubcluster(userId: string, id: string) {
        const s = subclustersStore.get(id);
        if (s && s.userId === userId) subclustersStore.delete(id);
    }
    async listSubclusters(userId: string) {
        return Array.from(subclustersStore.values()).filter(s => s.userId === userId);
    }

    // --- Stats Operations ---
    async saveStats(doc: GraphStatsDoc) {
      statsStore.set(doc.userId, { ...doc });
    }
    async getStats(userId: string) {
      return statsStore.get(userId) || null;
    }
    async deleteStats(userId: string) {
      statsStore.delete(userId);
    }

    // --- Insight Summary ---
    async upsertGraphSummary(userId: string, doc: GraphSummaryDoc) {
        summaryStore.set(userId, { ...doc });
    }
    async getGraphSummary(userId: string) {
        return summaryStore.get(userId) || null;
    }
  }
}));

// --- UserRepository Mock ---
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findById(id: any) {
      return { id: String(id), email: 'u1@test.com' };
    }
  }
}));

describe('Graph API Integration Tests', () => {
  let app: any;
  const userId = '12345';
  let accessToken: string;

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createApp();
    accessToken = generateAccessToken({ userId });
  });

  beforeEach(() => {
    nodesStore.clear();
    edgesStore.clear();
    clustersStore.clear();
    subclustersStore.clear();
    statsStore.clear();
    summaryStore.clear();
  });

  describe('Node Operations', () => {
    it('should create and retrieve a node', async () => {
      const nodeData = { id: 1, origId: 'orig1', clusterId: 'c1', clusterName: 'C1', numMessages: 5 };
      const res = await request(app)
        .post('/v1/graph/nodes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(nodeData);

      expect(res.status).toBe(201);
      
      const getRes = await request(app)
        .get('/v1/graph/nodes/1')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(getRes.status).toBe(200);
      expect(getRes.body.origId).toBe('orig1');
    });

    it('should list nodes', async () => {
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        nodesStore.set(2, { id: 2, userId, origId: 'o2', clusterId: 'c2', clusterName: 'C2', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });

        const res = await request(app)
            .get('/v1/graph/nodes')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    it('should list nodes by cluster', async () => {
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        nodesStore.set(2, { id: 2, userId, origId: 'o2', clusterId: 'c2', clusterName: 'C2', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });

        const res = await request(app)
            .get('/v1/graph/nodes')
            .query({ clusterId: 'c1' })
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(1);
    });

    it('should update a node', async () => {
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        
        await request(app)
            .patch('/v1/graph/nodes/1')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ clusterName: 'New Name' })
            .expect(204);
        
        expect(nodesStore.get(1)?.clusterName).toBe('New Name');
    });

    it('should delete a node', async () => {
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        
        await request(app)
            .delete('/v1/graph/nodes/1')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(204);
        
        expect(nodesStore.has(1)).toBe(false);
    });

    it('should cascade delete a node (mock logic check)', async () => {
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        edgesStore.set('e1', { id: 'e1', userId, source: 1, target: 2, weight: 1, type: 'hard', intraCluster: true, createdAt: '', updatedAt: '' });

        await request(app)
            .delete('/v1/graph/nodes/1/cascade')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(204);
        
        expect(nodesStore.has(1)).toBe(false);
        expect(edgesStore.has('e1')).toBe(false);
    });
  });

  describe('Edge Operations', () => {
    it('should create and list edges', async () => {
        const edgeData = { id: 'e1', source: 1, target: 2, weight: 1, type: 'hard', intraCluster: true };
        await request(app)
            .post('/v1/graph/edges')
            .set('Authorization', `Bearer ${accessToken}`)
            .send(edgeData)
            .expect(201);
        
        const res = await request(app)
            .get('/v1/graph/edges')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe('e1');
    });

    it('should delete an edge', async () => {
        edgesStore.set('e1', { id: 'e1', userId, source: 1, target: 2, weight: 1, type: 'hard', intraCluster: true, createdAt: '', updatedAt: '' });
        
        await request(app)
            .delete('/v1/graph/edges/e1')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(204);
        
        expect(edgesStore.has('e1')).toBe(false);
    });
  });

  describe('Cluster Operations', () => {
    it('should create and retrieve a cluster', async () => {
        const clusterData = { id: 'c1', name: 'Cluster 1', description: 'Desc', size: 10, themes: ['T1'] };
        await request(app)
            .post('/v1/graph/clusters')
            .set('Authorization', `Bearer ${accessToken}`)
            .send(clusterData)
            .expect(201);
        
        const res = await request(app)
            .get('/v1/graph/clusters/c1')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Cluster 1');
    });

    it('should list clusters', async () => {
        clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: '', size: 1, themes: [], createdAt: '', updatedAt: '' });
        clustersStore.set('c2', { id: 'c2', userId, name: 'C2', description: '', size: 1, themes: [], createdAt: '', updatedAt: '' });

        const res = await request(app)
            .get('/v1/graph/clusters')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    it('should delete a cluster', async () => {
        clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: '', size: 1, themes: [], createdAt: '', updatedAt: '' });
        
        await request(app)
            .delete('/v1/graph/clusters/c1')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(204);
        
        expect(clustersStore.has('c1')).toBe(false);
    });

    it('should cascade delete a cluster', async () => {
        clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: '', size: 1, themes: [], createdAt: '', updatedAt: '' });
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        edgesStore.set('e1', { id: 'e1', userId, source: 1, target: 2, weight: 1, type: 'hard', intraCluster: true, createdAt: '', updatedAt: '' });

        await request(app)
            .delete('/v1/graph/clusters/c1/cascade')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(204);
        
        expect(clustersStore.has('c1')).toBe(false);
        expect(nodesStore.has(1)).toBe(false);
        expect(edgesStore.has('e1')).toBe(false);
    });
  });

  describe('Stats & Snapshot', () => {
    it('should get stats', async () => {
        statsStore.set(userId, { id: userId, userId, nodes: 10, edges: 20, clusters: 5, generatedAt: '', metadata: {} });
        
        const res = await request(app)
            .get('/v1/graph/stats')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body.nodes).toBe(10);
    });

    it('should get snapshot', async () => {
        nodesStore.set(1, { id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, createdAt: '', updatedAt: '', timestamp: null });
        edgesStore.set('e1', { id: 'e1', userId, source: 1, target: 2, weight: 1, type: 'hard', intraCluster: true, createdAt: '', updatedAt: '' });
        clustersStore.set('c1', { id: 'c1', userId, name: 'C1', description: '', size: 1, themes: [], createdAt: '', updatedAt: '' });
        statsStore.set(userId, { id: userId, userId, nodes: 1, edges: 1, clusters: 1, generatedAt: '', metadata: {} });

        const res = await request(app)
            .get('/v1/graph/snapshot')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body.nodes).toHaveLength(1);
        expect(res.body.edges).toHaveLength(1);
        expect(res.body.clusters).toHaveLength(1);
        expect(res.body.stats.nodes).toBe(1);
    });

    it('should save snapshot', async () => {
        const snapshot = {
            nodes: [{ id: 1, userId, origId: 'o1', clusterId: 'c1', clusterName: 'C1', numMessages: 1, timestamp: null }],
            edges: [{ id: 'e1', userId, source: 1, target: 2, weight: 1, type: 'hard', intraCluster: true }],
            clusters: [{ id: 'c1', userId, name: 'C1', description: 'D', size: 1, themes: [] }],
            subclusters: [],
            stats: { nodes: 1, edges: 1, clusters: 1, generatedAt: new Date().toISOString(), metadata: {} }
        };

        await request(app)
            .post('/v1/graph/snapshot')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ snapshot })
            .expect(204);
        
        expect(nodesStore.size).toBe(1);
        expect(edgesStore.size).toBe(1);
        expect(clustersStore.size).toBe(1);
    });
  });
});
