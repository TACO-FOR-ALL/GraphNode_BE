import { Express } from 'express';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import type { GraphEdgeDto, GraphNodeDto } from '../../src/shared/dtos/graph';

// Mock the service layer
const mockGraphVectorService = {
  upsertNode: jest.fn(),
  findNode: jest.fn(),
  listNodes: jest.fn(),
  updateNode: jest.fn(),
  deleteNode: jest.fn(),
  upsertEdge: jest.fn(),
  listEdges: jest.fn(),
  deleteEdge: jest.fn(),
  findNeighborNodes: jest.fn(),
  findNeighborEdges: jest.fn(),
  getGraph: jest.fn(),
  removeNodeCascade: jest.fn(),
  upsertCluster: jest.fn(),
  findCluster: jest.fn(),
  listClusters: jest.fn(),
  deleteCluster: jest.fn(),
  removeClusterCascade: jest.fn(),
  getStats: jest.fn(),
  getSnapshotForUser: jest.fn(),
  persistSnapshot: jest.fn(),
};

jest.mock('../../src/core/services/GraphVectorService', () => {
  return {
    GraphVectorService: jest.fn().mockImplementation(() => {
      return mockGraphVectorService;
    }),
  };
});

jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) {
        const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        u.searchParams.set('state', state);
        return u.toString();
      }
      async exchangeCode(_code: string) {
        return { access_token: 'at', expires_in: 3600, token_type: 'Bearer' };
      }
      async fetchUserInfo(_token: any) {
        return { sub: 'google-uid-1', email: 'u@example.com', name: 'U', picture: 'https://img' };
      }
    },
  };
});

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 'user-test-id' } as any;
      }
    },
  };
});


describe('Graph API', () => {
  let app: Express;
  let agent: request.SuperTest<request.Test>;

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-secret';
    process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
    process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
    process.env.MYSQL_URL = 'mysql://user:pass@localhost:3306/db';
    process.env.MONGODB_URL = 'mongodb://localhost:27017/db';
    process.env.QDRANT_URL = 'http://localhost:6333';
    process.env.QDRANT_API_KEY = 'test-key';
    process.env.QDRANT_COLLECTION_NAME = 'test-collection';
    process.env.REDIS_URL = 'redis://localhost:6379';

    app = createApp();
    agent = request.agent(app);

    // Simulate login to get a valid session cookie
    const startResponse = await agent.get('/auth/google/start');
    const location = startResponse.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    await agent.get('/auth/google/callback').query({ code: 'ok', state });
  });

  describe('Nodes API', () => {
    it('should create a node', async () => {
      const node: Omit<GraphNodeDto, 'userId'> = {
        id: 1,
        origId: 'conv-1',
        clusterId: 'cluster-1',
        clusterName: 'Test Cluster',
        timestamp: '2025-01-01T00:00:00.000Z',
        numMessages: 1,
      };
      
      mockGraphVectorService.upsertNode.mockResolvedValue(undefined);

      const res = await agent
        .post('/v1/graph/nodes')
        .send(node)
        .expect(201);

      expect(mockGraphVectorService.upsertNode).toHaveBeenCalledWith({ ...node, userId: 'user-test-id' });
      expect(res.body).toEqual(node);
    });

    it('should get a node', async () => {
      const node: GraphNodeDto = {
        id: 1,
        userId: 'user-test-id',
        origId: 'conv-1',
        clusterId: 'cluster-1',
        clusterName: 'Test Cluster',
        timestamp: '2025-01-01T00:00:00.000Z',
        numMessages: 1,
      };
      mockGraphVectorService.findNode.mockResolvedValue(node);

      const res = await agent
        .get('/v1/graph/nodes/1')
        .expect(200);

      expect(mockGraphVectorService.findNode).toHaveBeenCalledWith('user-test-id', 1);
      expect(res.body).toEqual(node);
    });

    it('should list all nodes for a user', async () => {
      const nodes: GraphNodeDto[] = [
        {
          id: 1,
          userId: 'user-test-id',
          origId: 'conv-1',
          clusterId: 'cluster-1',
          clusterName: 'Test Cluster',
          timestamp: '2025-01-01T00:00:00.000Z',
          numMessages: 1,
        },
      ];
      mockGraphVectorService.listNodes.mockResolvedValue(nodes);

      const res = await agent.get('/v1/graph/nodes');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(nodes);
      expect(mockGraphVectorService.listNodes).toHaveBeenCalledWith('user-test-id');
    });

    it('should update a node', async () => {
      const patch: Partial<GraphNodeDto> = {
        clusterName: 'Updated Cluster',
      };
      mockGraphVectorService.updateNode.mockResolvedValue(undefined);

      await agent
        .patch('/v1/graph/nodes/1')
        .send(patch)
        .expect(204);
      
      expect(mockGraphVectorService.updateNode).toHaveBeenCalledWith('user-test-id', 1, patch);
    });

    it('should delete a node', async () => {
      mockGraphVectorService.deleteNode.mockResolvedValue(undefined);
      await agent
        .delete('/v1/graph/nodes/1')
        .expect(204);
      expect(mockGraphVectorService.deleteNode).toHaveBeenCalledWith('user-test-id', 1);
    });

    it('should delete a node and its edges (cascade)', async () => {
      mockGraphVectorService.removeNodeCascade.mockResolvedValue(undefined);

      const res = await agent.delete('/v1/graph/nodes/1/cascade');

      expect(res.status).toBe(204);
      expect(mockGraphVectorService.removeNodeCascade).toHaveBeenCalledWith(
        'user-test-id',
        1
      );
    });
  });

  // --- Edge Tests ---
  describe('Edges API', () => {
    it('should create an edge and return its ID', async () => {
      const newEdge: Omit<GraphEdgeDto, 'userId' | 'id'> = {
        source: 1,
        target: 2,
        weight: 1,
        type: 'hard',
        intraCluster: false,
      };
      mockGraphVectorService.upsertEdge.mockResolvedValue('edge-1');

      const res = await agent.post('/v1/graph/edges').send(newEdge);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'edge-1' });
      expect(mockGraphVectorService.upsertEdge).toHaveBeenCalledWith({
        ...newEdge,
        userId: 'user-test-id',
      });
    });

    it('should list all edges for a user', async () => {
      const edges: GraphEdgeDto[] = [
        {
          id: 'edge-1',
          source: 1,
          target: 2,
          weight: 1,
          type: 'hard',
          intraCluster: false,
          userId: 'user-test-id',
        },
      ];
      mockGraphVectorService.listEdges.mockResolvedValue(edges);

      const res = await agent.get('/v1/graph/edges');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(edges);
      expect(mockGraphVectorService.listEdges).toHaveBeenCalledWith('user-test-id');
    });

    it('should delete an edge', async () => {
      mockGraphVectorService.deleteEdge.mockResolvedValue(undefined);

      const res = await agent.delete('/v1/graph/edges/edge-1');

      expect(res.status).toBe(204);
      expect(mockGraphVectorService.deleteEdge).toHaveBeenCalledWith(
        'user-test-id',
        'edge-1'
      );
    });
  });

  // --- Cluster Tests ---
  describe('Clusters API', () => {
    it('should create a cluster', async () => {
      const newCluster = {
        id: 'cluster-1',
        name: 'Test Cluster',
        description: 'A test cluster',
        size: 1,
        themes: ['testing'],
      };
      mockGraphVectorService.upsertCluster.mockResolvedValue(undefined);

      const res = await agent.post('/v1/graph/clusters').send(newCluster);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newCluster);
      expect(mockGraphVectorService.upsertCluster).toHaveBeenCalledWith({
        ...newCluster,
        userId: 'user-test-id',
      });
    });

    it('should get a cluster', async () => {
      const cluster = {
        id: 'cluster-1',
        userId: 'user-test-id',
        name: 'Test Cluster',
        description: 'A test cluster',
        size: 1,
        themes: ['testing'],
      };
      mockGraphVectorService.findCluster.mockResolvedValue(cluster);

      const res = await agent.get('/v1/graph/clusters/cluster-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(cluster);
      expect(mockGraphVectorService.findCluster).toHaveBeenCalledWith(
        'user-test-id',
        'cluster-1'
      );
    });

    it('should list all clusters for a user', async () => {
      const clusters = [
        {
          id: 'cluster-1',
          userId: 'user-test-id',
          name: 'Test Cluster',
          description: 'A test cluster',
          size: 1,
          themes: ['testing'],
        },
      ];
      mockGraphVectorService.listClusters.mockResolvedValue(clusters);

      const res = await agent.get('/v1/graph/clusters');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(clusters);
      expect(mockGraphVectorService.listClusters).toHaveBeenCalledWith('user-test-id');
    });

    it('should delete a cluster', async () => {
      mockGraphVectorService.deleteCluster.mockResolvedValue(undefined);

      const res = await agent.delete('/v1/graph/clusters/cluster-1');

      expect(res.status).toBe(204);
      expect(mockGraphVectorService.deleteCluster).toHaveBeenCalledWith(
        'user-test-id',
        'cluster-1'
      );
    });

    it('should delete a cluster and its contents (cascade)', async () => {
      mockGraphVectorService.removeClusterCascade.mockResolvedValue(undefined);

      const res = await agent.delete('/v1/graph/clusters/cluster-1/cascade');

      expect(res.status).toBe(204);
      expect(mockGraphVectorService.removeClusterCascade).toHaveBeenCalledWith(
        'user-test-id',
        'cluster-1'
      );
    });
  });

  // --- Stats, Snapshot Tests ---
  describe('Stats and Snapshot API', () => {
    it('should get graph stats for a user', async () => {
      const stats = { nodes: 10, edges: 20, clusters: 2 };
      mockGraphVectorService.getStats.mockResolvedValue(stats);

      const res = await agent.get('/v1/graph/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(stats);
      expect(mockGraphVectorService.getStats).toHaveBeenCalledWith('user-test-id');
    });

    it('should get a full graph snapshot for a user', async () => {
      const snapshot = {
        nodes: [{ id: 1, label: 'Node 1' }],
        edges: [{ source: 1, target: 1, label: 'self' }],
        clusters: [{ id: 'c1', label: 'Cluster 1' }],
      };
      mockGraphVectorService.getSnapshotForUser.mockResolvedValue(snapshot);

      const res = await agent.get('/v1/graph/snapshot');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(snapshot);
      expect(mockGraphVectorService.getSnapshotForUser).toHaveBeenCalledWith('user-test-id');
    });

    it('should save a full graph snapshot for a user', async () => {
      const snapshot = {
        nodes: [],
        edges: [],
        clusters: [],
        stats: {
          nodes: 0,
          edges: 0,
          clusters: 0,
        },
      };
      mockGraphVectorService.persistSnapshot.mockResolvedValue(undefined);

      const res = await agent.post('/v1/graph/snapshot').send({ snapshot });

      expect(res.status).toBe(204);
      expect(mockGraphVectorService.persistSnapshot).toHaveBeenCalledWith({
        userId: 'user-test-id',
        snapshot,
      });
    });
  });
});
