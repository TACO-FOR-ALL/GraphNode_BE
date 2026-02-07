import { GraphVectorService } from '../../src/core/services/GraphVectorService';
import { GraphVectorRepository } from '../../src/infra/repositories/GraphVectorRepository';

// Mock GraphVectorRepository
jest.mock('../../src/infra/repositories/GraphVectorRepository');

describe('GraphVectorService', () => {
  let service: GraphVectorService;
  let mockRepo: jest.Mocked<GraphVectorRepository>;

  beforeEach(() => {
    mockRepo = {
      saveGraphFeatures: jest.fn(),
      searchNodes: jest.fn(),
    } as unknown as jest.Mocked<GraphVectorRepository>;

    service = new GraphVectorService(mockRepo);
  });

  describe('saveGraphFeatures', () => {
    it('should delegate to repo.saveGraphFeatures', async () => {
      const userId = 'user1';
      const features: any = { some: 'data' };
      
      await service.saveGraphFeatures(userId, features);
      
      expect(mockRepo.saveGraphFeatures).toHaveBeenCalledWith(userId, features);
    });
  });

  describe('searchNodes', () => {
    it('should delegate to repo.searchNodes', async () => {
      const userId = 'user1';
      const query = [1, 2, 3];
      const limit = 10;
      
      await service.searchNodes(userId, query, limit);
      
      expect(mockRepo.searchNodes).toHaveBeenCalledWith(userId, query, limit);
    });

    it('should use default limit if not provided', async () => {
        await service.searchNodes('u1', [1]);
        expect(mockRepo.searchNodes).toHaveBeenCalledWith('u1', [1], 5);
    });
  });
});
