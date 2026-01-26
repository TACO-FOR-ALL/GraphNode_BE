import { GraphManagementService } from '../../src/core/services/GraphManagementService';
import { GraphDocumentStore } from '../../src/core/ports/GraphDocumentStore';
import { GraphNodeDto } from '../../src/shared/dtos/graph';
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
        nodeId: validNode.id,
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

  describe('findNode', () => {
    it('should return DTO if node exists', async () => {
      const mockDoc: GraphNodeDoc = {
        _id: 'user-1::1',
        nodeId: 1,
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
});
