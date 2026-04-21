import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { GraphManagementService } from '../../src/core/services/GraphManagementService';
import { VectorStore } from '../../src/core/ports/VectorStore';
import { GraphNodeDto } from '../../src/shared/dtos/graph';
import { ConversationService } from '../../src/core/services/ConversationService';
import { NoteService } from '../../src/core/services/NoteService';

describe('GraphEmbeddingService', () => {
  let service: GraphEmbeddingService;
  let mockGraphService: jest.Mocked<GraphManagementService>;
  let mockVectorStore: jest.Mocked<VectorStore>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockNoteService: jest.Mocked<NoteService>;

  beforeEach(() => {
    mockGraphService = {
      upsertNode: jest.fn(),
      upsertNodes: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      deleteNodes: jest.fn(),
      findNode: jest.fn(),
      findNodesByOrigIds: jest.fn(),
      findNodesByOrigIdsAll: jest.fn(),
      listNodes: jest.fn(),
      listNodeDocs: jest.fn(),
      listNodesAll: jest.fn(),
      listNodesByCluster: jest.fn(),
      listNodesBySubcluster: jest.fn(),
      upsertEdge: jest.fn(),
      upsertEdges: jest.fn(),
      deleteEdge: jest.fn(),
      deleteEdgeBetween: jest.fn(),
      deleteEdgesByNodeIds: jest.fn(),
      restoreEdge: jest.fn(),
      listEdges: jest.fn(),
      upsertCluster: jest.fn(),
      upsertClusters: jest.fn(),
      deleteCluster: jest.fn(),
      restoreCluster: jest.fn(),
      findCluster: jest.fn(),
      listClusters: jest.fn(),
      upsertSubcluster: jest.fn(),
      upsertSubclusters: jest.fn(),
      deleteSubcluster: jest.fn(),
      restoreSubcluster: jest.fn(),
      listSubclusters: jest.fn(),
      countNodes: jest.fn(),
      countEdges: jest.fn(),
      countClusters: jest.fn(),
      saveStats: jest.fn(),
      getStats: jest.fn(),
      deleteStats: jest.fn(),
      upsertGraphSummary: jest.fn(),
      getGraphSummary: jest.fn(),
      deleteGraphSummary: jest.fn(),
      restoreGraphSummary: jest.fn(),
      deleteGraph: jest.fn(),
      restoreGraph: jest.fn(),
      restoreNode: jest.fn(),
      restoreNodesByOrigIds: jest.fn(),
      deleteNodesByOrigIds: jest.fn(),
      persistSnapshotBulk: jest.fn(),
    } as unknown as jest.Mocked<GraphManagementService>;

    mockVectorStore = {
      ensureCollection: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
      deleteByFilter: jest.fn(),
    } as unknown as jest.Mocked<VectorStore>;

    mockConversationService = {
      findDocsByIds: jest.fn(),
      countConversations: jest.fn(),
    } as unknown as jest.Mocked<ConversationService>;

    mockNoteService = {
      getNoteDoc: jest.fn(),
      countNotes: jest.fn(),
    } as unknown as jest.Mocked<NoteService>;

    service = new GraphEmbeddingService(
      mockGraphService,
      mockVectorStore,
      mockConversationService,
      mockNoteService
    );
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

    it('should reconstruct subclusters from node membership and legacy nodeIds', async () => {
      mockGraphService.listNodeDocs.mockResolvedValue([
        {
          id: 1,
          userId: 'u1',
          origId: 'conv-1',
          clusterId: 'c1',
          subclusterId: 's1',
          timestamp: null,
          numMessages: 1,
          sourceType: 'chat',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 2,
          userId: 'u1',
          origId: 'conv-2',
          clusterId: 'c1',
          subclusterId: null,
          timestamp: null,
          numMessages: 1,
          sourceType: 'chat',
          createdAt: '',
          updatedAt: '',
        },
      ] as any);
      mockGraphService.listEdges.mockResolvedValue([]);
      mockGraphService.listClusters.mockResolvedValue([
        { id: 'c1', userId: 'u1', name: 'Cluster 1', description: '', size: 999, themes: [] },
      ] as any);
      mockGraphService.listSubclusters.mockResolvedValue([
        {
          id: 's1',
          userId: 'u1',
          clusterId: 'c1',
          nodeIds: [1, 2, 999],
          representativeNodeId: 1,
          size: 3,
          density: 0.4,
          topKeywords: ['topic'],
          createdAt: '',
          updatedAt: '',
        },
      ] as any);
      mockGraphService.getStats.mockResolvedValue({
        userId: 'u1',
        nodes: 2,
        edges: 0,
        clusters: 1,
        status: 'CREATED',
      } as any);
      mockGraphService.countNodes.mockResolvedValue(2 as never);
      mockGraphService.countEdges.mockResolvedValue(0 as never);
      mockGraphService.countClusters.mockResolvedValue(1 as never);
      mockConversationService.findDocsByIds.mockResolvedValue([] as any);

      const snapshot = await service.getSnapshotForUser('u1');

      expect(snapshot.clusters).toEqual([
        expect.objectContaining({
          id: 'c1',
          size: 2,
        }),
      ]);
      expect(snapshot.subclusters).toEqual([
        expect.objectContaining({
          id: 's1',
          clusterId: 'c1',
          nodeIds: [1, 2],
          representativeNodeId: 1,
          size: 2,
        }),
      ]);
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
      expect(mockGraphService.deleteNode).toHaveBeenCalledWith('u1', 1, undefined, expect.any(Object));
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

  describe('getSnapshotForUser', () => {
    it('should attach nodeTitle for chat and markdown nodes only', async () => {
      mockGraphService.listNodeDocs.mockResolvedValue([
        {
          id: 1,
          userId: 'u1',
          origId: 'conv-1',
          clusterId: 'c1',
          subclusterId: null,
          clusterName: 'Cluster 1',
          timestamp: null,
          numMessages: 3,
          sourceType: 'chat',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 2,
          userId: 'u1',
          origId: 'note-1',
          clusterId: 'c1',
          subclusterId: null,
          clusterName: 'Cluster 1',
          timestamp: null,
          numMessages: 0,
          sourceType: 'markdown',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 3,
          userId: 'u1',
          origId: 'notion-1',
          clusterId: 'c2',
          subclusterId: null,
          clusterName: 'Cluster 2',
          timestamp: null,
          numMessages: 0,
          sourceType: 'notion',
          createdAt: '',
          updatedAt: '',
        },
      ] as any);
      mockGraphService.listEdges.mockResolvedValue([]);
      mockGraphService.listClusters.mockResolvedValue([
        { id: 'c1', userId: 'u1', name: 'Cluster 1', description: '', size: 2, themes: [] },
        { id: 'c2', userId: 'u1', name: 'Cluster 2', description: '', size: 1, themes: [] },
      ] as any);
      mockGraphService.listSubclusters.mockResolvedValue([]);
      mockGraphService.getStats.mockResolvedValue({
        userId: 'u1',
        nodes: 3,
        edges: 0,
        clusters: 2,
        status: 'CREATED',
      });
      mockGraphService.countNodes.mockResolvedValue(3 as never);
      mockGraphService.countEdges.mockResolvedValue(0 as never);
      mockGraphService.countClusters.mockResolvedValue(2 as never);
      mockConversationService.findDocsByIds.mockResolvedValue([
        {
          _id: 'conv-1',
          ownerUserId: 'u1',
          title: 'Conversation Title',
        },
      ] as any);
      mockNoteService.getNoteDoc.mockResolvedValue({
        _id: 'note-1',
        ownerUserId: 'u1',
        title: 'Note Title',
      } as any);

      const snapshot = await service.getSnapshotForUser('u1');

      expect(mockConversationService.findDocsByIds).toHaveBeenCalledWith(['conv-1'], 'u1');
      expect(mockNoteService.getNoteDoc).toHaveBeenCalledWith('note-1', 'u1');
      expect(snapshot.nodes).toHaveLength(3);
      expect(snapshot.nodes[0]).toMatchObject({
        origId: 'conv-1',
        nodeTitle: 'Conversation Title',
        clusterName: 'Cluster 1',
      });
      expect(snapshot.nodes[1]).toMatchObject({
        origId: 'note-1',
        nodeTitle: 'Note Title',
        clusterName: 'Cluster 1',
      });
      expect(snapshot.nodes[2]).toMatchObject({
        origId: 'notion-1',
        clusterName: 'Cluster 2',
      });
      expect(snapshot.nodes[2]).not.toHaveProperty('nodeTitle');
      // stats는 실시간 count로 대체됨
      expect(snapshot.stats).toMatchObject({ nodes: 3, edges: 0, clusters: 2, status: 'CREATED' });
    });
  });

  describe('GraphSummary Delegation', () => {
    it('upsertGraphSummary delegates', async () => {
      const summary: any = { id: 'u1' };
      await service.upsertGraphSummary('u1', summary);
      expect(mockGraphService.upsertGraphSummary).toHaveBeenCalledWith('u1', summary);
    });

    it('getGraphSummary merges live counts into summary overview', async () => {
      mockGraphService.getGraphSummary.mockResolvedValue({
        overview: {
          total_source_nodes: 0,
          total_conversations: 0,
          total_notes: 0,
        },
      } as any);
      mockConversationService.countConversations.mockResolvedValue(7 as never);
      mockNoteService.countNotes.mockResolvedValue(3 as never);
      mockGraphService.countNodes.mockResolvedValue(10 as never);

      const result = await service.getGraphSummary('u1');

      expect(mockGraphService.getGraphSummary).toHaveBeenCalledWith('u1');
      expect(mockConversationService.countConversations).toHaveBeenCalledWith('u1');
      expect(mockNoteService.countNotes).toHaveBeenCalledWith('u1');
      expect(mockGraphService.countNodes).toHaveBeenCalledWith('u1');
      expect(result.overview.total_source_nodes).toBe(10);
      expect(result.overview.total_conversations).toBe(7);
      expect(result.overview.total_notes).toBe(3);
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
