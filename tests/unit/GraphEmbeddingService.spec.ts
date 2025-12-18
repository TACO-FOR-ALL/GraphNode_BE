import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { GraphManagementService } from '../../src/core/services/GraphManagementService';
import { VectorService } from '../../src/core/services/VectorService';
import { GraphNodeDto } from '../../src/shared/dtos/graph';

describe('GraphEmbeddingService', () => {
  let service: GraphEmbeddingService;
  let mockGraphService: jest.Mocked<GraphManagementService>;
  let mockVectorService: jest.Mocked<VectorService>;

  beforeEach(() => {
    mockGraphService = {
      upsertNode: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      findNode: jest.fn(),
      listNodes: jest.fn(),
    } as unknown as jest.Mocked<GraphManagementService>;

    mockVectorService = {} as unknown as jest.Mocked<VectorService>;

    service = new GraphEmbeddingService(mockGraphService, mockVectorService);
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
        updatedAt: ''
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
      expect(mockGraphService.deleteNode).toHaveBeenCalledWith('u1', 1, undefined);
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

  describe('Vector operations (Disabled)', () => {
    it('prepareNodeAndVector should throw error', async () => {
      await expect(service.prepareNodeAndVector({}, [], {})).rejects.toThrow('Vector operations are temporarily disabled');
    });

    it('applyBatchNodes should throw error', async () => {
      await expect(service.applyBatchNodes([])).rejects.toThrow('Vector operations are temporarily disabled');
    });

    it('searchNodesByVector should throw error', async () => {
      await expect(service.searchNodesByVector('u1', 'col', [])).rejects.toThrow('Vector operations are temporarily disabled');
    });

    it('findNodesMissingVectors should throw error', async () => {
      await expect(service.findNodesMissingVectors('u1', 'col', [])).rejects.toThrow('Vector operations are temporarily disabled');
    });
  });
});
