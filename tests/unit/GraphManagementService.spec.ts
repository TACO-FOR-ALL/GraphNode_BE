import { GraphManagementService } from '../../src/core/services/GraphManagementService';
import { GraphDocumentStore } from '../../src/core/ports/GraphDocumentStore';
import { GraphNodeDto, GraphEdgeDto } from '../../src/shared/dtos/graph';
import { ValidationError, UpstreamError } from '../../src/shared/errors/domain';
import { GraphNodeDoc } from '../../src/core/types/persistence/graph.persistence';

describe('GraphManagementService', () => {
  let service: GraphManagementService;
  let mockRepo: jest.Mocked<GraphDocumentStore>;

  beforeEach(() => {
    mockRepo = {
      upsertNode: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      deleteNodes: jest.fn(),
      findNode: jest.fn(),
      listNodes: jest.fn(),
      listNodesByCluster: jest.fn(),
      upsertEdge: jest.fn(),
      deleteEdge: jest.fn(),
      deleteEdgeBetween: jest.fn(),
      deleteEdgesByNodeIds: jest.fn(),
      listEdges: jest.fn(),
      upsertCluster: jest.fn(),
      deleteCluster: jest.fn(),
      findCluster: jest.fn(),
      listClusters: jest.fn(),
      saveStats: jest.fn(),
      getStats: jest.fn(),
      deleteStats: jest.fn(),
      upsertGraphSummary: jest.fn(),
      getGraphSummary: jest.fn(),
      upsertSubcluster: jest.fn(),
    } as unknown as jest.Mocked<GraphDocumentStore>;

    service = new GraphManagementService(mockRepo);
  });

  describe('upsertNode', () => {
    const validNode: GraphNodeDto = {
      id: 1,
      userId: 'user-1',
      origId: 'conv-1',
      clusterId: 'cluster-1',
      clusterName: 'Cluster 1',
      timestamp: new Date().toISOString(),
      numMessages: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should call repo.upsertNode with correct doc', async () => {
      await service.upsertNode(validNode);

      expect(mockRepo.upsertNode).toHaveBeenCalledTimes(1);
      const calledDoc = mockRepo.upsertNode.mock.calls[0][0];
      expect(calledDoc).toMatchObject({
        id: validNode.id,
        userId: validNode.userId,
        origId: validNode.origId,
      });
    });

    it('should throw ValidationError if userId is missing', async () => {
      const invalidNode = { ...validNode, userId: '' };
      await expect(service.upsertNode(invalidNode)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if id is not a number', async () => {
      const invalidNode = { ...validNode, id: 'not-a-number' as any };
      await expect(service.upsertNode(invalidNode)).rejects.toThrow(ValidationError);
    });

    it('should wrap unknown errors in UpstreamError', async () => {
      mockRepo.upsertNode.mockRejectedValue(new Error('DB Error'));
      await expect(service.upsertNode(validNode)).rejects.toThrow(UpstreamError);
    });
  });

  describe('updateNode', () => {
    it('should call repo.updateNode with correct params', async () => {
      const patch = { clusterName: 'Updated Cluster' };
      await service.updateNode('user-1', 1, patch);

      expect(mockRepo.updateNode).toHaveBeenCalledWith(
        'user-1',
        1,
        expect.objectContaining(patch),
        undefined
      );
    });

    it('should throw ValidationError if userId is missing', async () => {
      await expect(service.updateNode('', 1, {})).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteNode', () => {
    it('should call repo.deleteNode', async () => {
      await service.deleteNode('user-1', 1);
      expect(mockRepo.deleteNode).toHaveBeenCalledWith('user-1', 1, undefined);
    });
  });
  
  describe('deleteNodes', () => {
    it('should call repo.deleteNodes', async () => {
      await service.deleteNodes('user-1', [1, 2]);
      expect(mockRepo.deleteNodes).toHaveBeenCalledWith('user-1', [1, 2], undefined);
    });
  });

  describe('findNode', () => {
    it('should return DTO if node exists', async () => {
      const mockDoc: GraphNodeDoc = {
        id: 1,
        userId: 'user-1',
        origId: 'conv-1',
        clusterId: 'cluster-1',
        clusterName: 'Cluster 1',
        timestamp: new Date().toISOString(),
        numMessages: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockRepo.findNode.mockResolvedValue(mockDoc);

      const result = await service.findNode('user-1', 1);
      expect(result).toMatchObject({
        id: 1,
        userId: 'user-1',
        origId: 'conv-1',
      });
    });

    it('should return null if node does not exist', async () => {
      mockRepo.findNode.mockResolvedValue(null);
      const result = await service.findNode('user-1', 999);
      expect(result).toBeNull();
    });
  });
  
  describe('listNodes', () => {
      it('should call repo.listNodes', async () => {
          mockRepo.listNodes.mockResolvedValue([]);
          await service.listNodes('user-1');
          expect(mockRepo.listNodes).toHaveBeenCalledWith('user-1');
      });
  });
  
  describe('listNodesByCluster', () => {
      it('should call repo.listNodesByCluster', async () => {
          mockRepo.listNodesByCluster.mockResolvedValue([]);
          await service.listNodesByCluster('user-1', 'c1');
          expect(mockRepo.listNodesByCluster).toHaveBeenCalledWith('user-1', 'c1');
      });
  });

  // --- Edge Tests ---
  describe('Edges', () => {
      const edge: GraphEdgeDto = { 
        source: 1, 
        target: 2, 
        weight: 1, 
        userId: 'u1',
        type: 'hard',
        intraCluster: false
      };

      it('upsertEdge calls repo', async () => {
          mockRepo.upsertEdge.mockResolvedValue('e1');
          await service.upsertEdge(edge);
          expect(mockRepo.upsertEdge).toHaveBeenCalledWith(expect.objectContaining(edge), undefined);
      });
      
      it('upsertEdge throws if validation fails', async () => {
        await expect(service.upsertEdge({ ...edge, userId: '' })).rejects.toThrow(ValidationError);
      });

      it('deleteEdge calls repo', async () => {
          await service.deleteEdge('u1', 'e1');
          expect(mockRepo.deleteEdge).toHaveBeenCalledWith('u1', 'e1', undefined);
      });

      it('deleteEdgeBetween calls repo', async () => {
          await service.deleteEdgeBetween('u1', 1, 2);
          expect(mockRepo.deleteEdgeBetween).toHaveBeenCalledWith('u1', 1, 2, undefined);
      });

      it('deleteEdgesByNodeIds calls repo', async () => {
          await service.deleteEdgesByNodeIds('u1', [1, 2]);
          expect(mockRepo.deleteEdgesByNodeIds).toHaveBeenCalledWith('u1', [1, 2], undefined);
      });

      it('listEdges calls repo', async () => {
          mockRepo.listEdges.mockResolvedValue([]);
          await service.listEdges('u1');
          expect(mockRepo.listEdges).toHaveBeenCalledWith('u1');
      });
  });

  // --- Cluster Tests ---
  describe('Clusters', () => {
      const cluster: any = { 
        id: 'c1', 
        name: 'C1', 
        userId: 'u1',
        description: 'Test Cluster',
        size: 5,
        themes: ['theme1'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      it('upsertCluster calls repo', async () => {
          await service.upsertCluster(cluster);
          expect(mockRepo.upsertCluster).toHaveBeenCalledWith(expect.objectContaining(cluster), undefined);
      });

      it('deleteCluster calls repo', async () => {
          await service.deleteCluster('u1', 'c1');
          expect(mockRepo.deleteCluster).toHaveBeenCalledWith('u1', 'c1', undefined);
      });

      it('findCluster calls repo', async () => {
          mockRepo.findCluster.mockResolvedValue(cluster);
          const res = await service.findCluster('u1', 'c1');
          expect(res).toEqual(cluster);
      });

      it('listClusters calls repo', async () => {
          mockRepo.listClusters.mockResolvedValue([cluster]);
          const res = await service.listClusters('u1');
          expect(res).toHaveLength(1);
      });
  });

  // --- Stats Tests ---
  describe('Stats', () => {
      it('saveStats calls repo', async () => {
          const stats = { userId: 'u1', nodes: 10, edges: 5, clusters: 2 };
          await service.saveStats(stats);
          expect(mockRepo.saveStats).toHaveBeenCalledWith(expect.objectContaining(stats), undefined);
      });

      it('getStats calls repo', async () => {
          mockRepo.getStats.mockResolvedValue({ id: 'u1', userId: 'u1', nodes: 10, edges: 5, clusters: 2, generatedAt: new Date().toISOString(), metadata: {} });
          const res = await service.getStats('u1');
          expect(res).toBeDefined();
          expect(res?.nodes).toBe(10);
      });

      it('deleteStats calls repo', async () => {
          await service.deleteStats('u1');
          expect(mockRepo.deleteStats).toHaveBeenCalledWith('u1', undefined);
      });
  });

  describe('GraphSummary', () => {
    const mockSummary: any = {
      id: 'user-1',
      userId: 'user-1',
      overview: {},
      generatedAt: new Date().toISOString(),
      detail_level: 'standard'
    };

    describe('upsertGraphSummary', () => {
      it('should call repo.upsertGraphSummary', async () => {
        await service.upsertGraphSummary('user-1', mockSummary);
        expect(mockRepo.upsertGraphSummary).toHaveBeenCalledWith('user-1', expect.objectContaining({ userId: 'user-1' }), undefined);
      });
      
      it('should validate user', async () => {
        await expect(service.upsertGraphSummary('', mockSummary)).rejects.toThrow(ValidationError);
      });
    });

    describe('getGraphSummary', () => {
      it('should return DTO if exists', async () => {
        mockRepo.getGraphSummary.mockResolvedValue(mockSummary);
        const result = await service.getGraphSummary('user-1');
        expect(result).toBeDefined();
        // check if _id is removed if it existed, though our mockSummary doesn't have _id
      });

      it('should return null if not found', async () => {
        mockRepo.getGraphSummary.mockResolvedValue(null);
        const result = await service.getGraphSummary('user-1');
        expect(result).toBeNull();
      });
    });
  });
});

