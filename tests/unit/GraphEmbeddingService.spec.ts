import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { GraphManagementService } from '../../src/core/services/GraphManagementService';
import { VectorStore } from '../../src/core/ports/VectorStore';
import { GraphNodeDto } from '../../src/shared/dtos/graph';

describe('GraphEmbeddingService', () => {
  let service: GraphEmbeddingService;
  let mockGraphService: jest.Mocked<GraphManagementService>;
  let mockVectorStore: jest.Mocked<VectorStore>;

  beforeEach(() => {
    mockGraphService = {
      upsertNode: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      findNode: jest.fn(),
      listNodes: jest.fn(),
      upsertEdge: jest.fn(),
      deleteEdge: jest.fn(),
      deleteEdgeBetween: jest.fn(),
      listEdges: jest.fn(),
      upsertCluster: jest.fn(),
      deleteCluster: jest.fn(),
      findCluster: jest.fn(),
      listClusters: jest.fn(),
      saveStats: jest.fn(),
      getStats: jest.fn(),
      deleteStats: jest.fn(),
      listNodesByCluster: jest.fn(),
      deleteEdgesByNodeIds: jest.fn(),
      upsertGraphSummary: jest.fn(),
      getGraphSummary: jest.fn(),
    } as unknown as jest.Mocked<GraphManagementService>;

    mockVectorStore = {
      ensureCollection: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
      deleteByFilter: jest.fn(),
    } as unknown as jest.Mocked<VectorStore>;

    service = new GraphEmbeddingService(mockGraphService, mockVectorStore);
  });

  describe('upsertNode', () => {
    it('should delegate to graphManagementService.upsertNode', async () => {
      const node: GraphNodeDto = {
        id: 1,
        userId: 'u1',
        origId: 'conv-1',
        clusterId: 'c1',
        clusterName: 'Cluster 1',
        timestamp: null,
        numMessages: 0,
        createdAt: '',
        updatedAt: '',
      };

      await service.upsertNode(node);
      expect(mockGraphService.upsertNode).toHaveBeenCalledWith(node);
    });
  });

  describe('updateNode', () => {
    it('should delegate to graphManagementService.updateNode', async () => {
      const patch = { clusterName: 'Updated' };
      await service.updateNode('u1', 1, patch);
      expect(mockGraphService.updateNode).toHaveBeenCalledWith('u1', 1, patch);
    });
  });

  describe('deleteNode', () => {
    it('should delegate to graphManagementService.deleteNode', async () => {
      await service.deleteNode('u1', 1);
      expect(mockGraphService.deleteNode).toHaveBeenCalledWith('u1', 1);
    });
  });

  describe('findNode', () => {
    it('should delegate to graphManagementService.findNode', async () => {
      await service.findNode('u1', 1);
      expect(mockGraphService.findNode).toHaveBeenCalledWith('u1', 1);
    });
  });

  describe('listNodes', () => {
    it('should delegate to graphManagementService.listNodes', async () => {
      await service.listNodes('u1');
      expect(mockGraphService.listNodes).toHaveBeenCalledWith('u1');
    });
  });

  describe('GraphSummary Delegation', () => {
    it('upsertGraphSummary delegates', async () => {
      const summary: any = { id: 'u1' };
      await service.upsertGraphSummary('u1', summary);
      expect(mockGraphService.upsertGraphSummary).toHaveBeenCalledWith('u1', summary);
    });

    it('getGraphSummary delegates', async () => {
      await service.getGraphSummary('u1');
      expect(mockGraphService.getGraphSummary).toHaveBeenCalledWith('u1');
    });
  });

  describe('Vector operations (Disabled)', () => {
    it('prepareNodeAndVector should throw error', async () => {
      await expect(service.prepareNodeAndVector({}, [], {})).rejects.toThrow(
        'Vector operations are temporarily disabled'
      );
    });

    it('applyBatchNodes should throw error', async () => {
      await expect(service.applyBatchNodes([])).rejects.toThrow(
        'Vector operations are temporarily disabled'
      );
    });

    it('searchNodesByVector should throw error', async () => {
      await expect(service.searchNodesByVector('u1', 'col', [])).rejects.toThrow(
        'Vector operations are temporarily disabled'
      );
    });

    it('findNodesMissingVectors should throw error', async () => {
      await expect(service.findNodesMissingVectors('u1', 'col', [])).rejects.toThrow(
        'Vector operations are temporarily disabled'
      );
    });
  });
});
