import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { GraphVectorService } from '../../src/core/services/GraphVectorService';
import { VectorStore } from '../../src/core/ports/VectorStore';
import { GraphManagementService } from '../../src/core/services/GraphManagementService';

describe('GraphVectorService', () => {
  let service: GraphVectorService;
  let mockVectorStore: jest.Mocked<VectorStore>;
  let mockGraphMgmtService: jest.Mocked<GraphManagementService>;

  beforeEach(() => {
    mockVectorStore = {
      ensureCollection: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
      deleteByFilter: jest.fn(),
    } as unknown as jest.Mocked<VectorStore>;

    mockGraphMgmtService = {
      findNodesByOrigIds: jest.fn(),
    } as unknown as jest.Mocked<GraphManagementService>;

    service = new GraphVectorService(mockVectorStore, mockGraphMgmtService);
  });

  describe('saveGraphFeatures', () => {
    it('should delegate to vectorStore.upsert', async () => {
      const userId = 'user1';
      const items: any[] = [{ id: '1', vector: [0.1] }];
      
      await service.saveGraphFeatures(userId, items);
      
      expect(mockVectorStore.upsert).toHaveBeenCalledWith(expect.any(String), items);
    });
  });

  describe('searchNodes', () => {
    it('should perform vector search and enrich results with graph nodes', async () => {
      const userId = 'user1';
      const queryVector = [0.1, 0.2];
      const mockVectorResults = [
        { score: 0.9, payload: { orig_id: 'conv1' } },
        { score: 0.8, payload: { orig_id: 'conv2' } },
      ];
      const mockNodes = [
        { id: 1, origId: 'conv1', userId, clusterId: 'c1', clusterName: 'C1' },
        { id: 2, origId: 'conv2', userId, clusterId: 'c1', clusterName: 'C1' },
      ];

      (mockVectorStore.search as any).mockResolvedValue(mockVectorResults);
      (mockGraphMgmtService.findNodesByOrigIds as any).mockResolvedValue(mockNodes);

      const results = await service.searchNodes(userId, queryVector, 2);

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.any(String),
        queryVector,
        expect.objectContaining({ filter: { user_id: userId }, limit: 2 })
      );
      expect(mockGraphMgmtService.findNodesByOrigIds).toHaveBeenCalledWith(userId, ['conv1', 'conv2']);
      expect(results).toHaveLength(2);
      expect(results[0].node.origId).toBe('conv1');
      expect(results[0].score).toBe(0.9);
    });

    it('should return empty if no vectors found', async () => {
      (mockVectorStore.search as any).mockResolvedValue([]);
      const results = await service.searchNodes('u1', [0]);
      expect(results).toHaveLength(0);
      expect(mockGraphMgmtService.findNodesByOrigIds).not.toHaveBeenCalled();
    });
  });
});
