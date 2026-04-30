import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { SearchService } from '../../src/core/services/SearchService';
import type {
  GraphRagClusterSiblingResult,
  GraphRagNeighborResult,
  MacroGraphStore,
} from '../../src/core/ports/MacroGraphStore';
import { GraphVectorService } from '../../src/core/services/GraphVectorService';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { NoteRepository } from '../../src/core/ports/NoteRepository';
import type { MessageRepository } from '../../src/core/ports/MessageRepository';
import {
  GRAPH_RAG_CLUSTER_SIBLING_BUDGET_RATIO,
  GRAPH_RAG_CLUSTER_SIBLING_DECAY,
  GRAPH_RAG_CONNECTION_BONUS_RATE,
  GRAPH_RAG_HOP_DECAY,
  GRAPH_RAG_NEIGHBOR_FETCH_MULTIPLIER,
  GRAPH_RAG_SEED_FETCH_MIN,
  GRAPH_RAG_SEED_FETCH_MULTIPLIER,
} from '../../src/config/graphRagConfig';

jest.mock('../../src/shared/utils/huggingface', () => ({
  generateMiniLMEmbedding: jest.fn(),
}));

const graphRagKeyword = 'graph rag';

describe('SearchService.graphRagSearch()', () => {
  let searchService: SearchService;
  let mockGraphVectorService: jest.Mocked<GraphVectorService>;
  let mockMacroGraphStore: jest.Mocked<MacroGraphStore>;
  let mockConversationRepository: jest.Mocked<ConversationRepository>;
  let mockNoteRepository: jest.Mocked<NoteRepository>;

  const userId = 'user-test-001';
  const keyword = graphRagKeyword;
  const embedding = Array(384).fill(0.1);

  const seedResults = [
    {
      node: {
        id: 1,
        userId,
        origId: 'conv-a',
        nodeTitle: 'Seed A from vector',
        clusterId: 'cluster-ai',
        clusterName: 'AI',
        numMessages: 10,
        timestamp: null,
        sourceType: 'chat' as const,
      },
      score: 0.9,
    },
    {
      node: {
        id: 2,
        userId,
        origId: 'conv-b',
        nodeTitle: 'Seed B from vector',
        clusterId: 'cluster-ai',
        clusterName: 'AI',
        numMessages: 5,
        timestamp: null,
        sourceType: 'chat' as const,
      },
      score: 0.7,
    },
  ];

  const neighbors: GraphRagNeighborResult[] = [
    {
      origId: 'conv-c',
      nodeId: 3,
      nodeType: 'conversation',
      clusterName: 'AI',
      hopDistance: 1,
      connectedSeeds: ['conv-a', 'conv-b'],
      avgEdgeWeight: 0.8,
      connectionCount: 2,
    },
    {
      origId: 'conv-d',
      nodeId: 4,
      nodeType: 'conversation',
      clusterName: 'AI',
      hopDistance: 1,
      connectedSeeds: ['conv-a'],
      avgEdgeWeight: 0.6,
      connectionCount: 1,
    },
    {
      origId: 'note-e',
      nodeId: 5,
      nodeType: 'note',
      clusterName: 'Research',
      hopDistance: 2,
      connectedSeeds: ['conv-a'],
      avgEdgeWeight: 0.5,
      connectionCount: 1,
    },
  ];

  const clusterSiblings: GraphRagClusterSiblingResult[] = [
    {
      origId: 'conv-f',
      nodeId: 6,
      nodeType: 'conversation',
      clusterName: 'AI',
      connectedSeeds: ['conv-a', 'conv-b'],
      connectionCount: 2,
    },
  ];

  beforeEach(() => {
    mockGraphVectorService = {
      searchNodes: jest.fn(),
      saveGraphFeatures: jest.fn(),
    } as unknown as jest.Mocked<GraphVectorService>;

    mockMacroGraphStore = {
      searchGraphRagNeighbors: jest.fn(),
      searchGraphRagClusterSiblings: jest.fn(),
    } as unknown as jest.Mocked<MacroGraphStore>;

    mockConversationRepository = {
      findByIds: jest.fn(),
    } as unknown as jest.Mocked<ConversationRepository>;

    mockNoteRepository = {
      getNote: jest.fn(),
    } as unknown as jest.Mocked<NoteRepository>;

    searchService = new SearchService(
      mockConversationRepository,
      mockNoteRepository,
      {} as MessageRepository,
      mockGraphVectorService,
      mockMacroGraphStore
    );

    const huggingfaceMock = jest.requireMock('../../src/shared/utils/huggingface') as {
      generateMiniLMEmbedding: jest.Mock;
    };
    huggingfaceMock.generateMiniLMEmbedding.mockReset();
    huggingfaceMock.generateMiniLMEmbedding.mockResolvedValue(embedding as never);

    mockGraphVectorService.searchNodes.mockResolvedValue(seedResults);
    mockMacroGraphStore.searchGraphRagNeighbors.mockResolvedValue(neighbors);
    mockMacroGraphStore.searchGraphRagClusterSiblings.mockResolvedValue(clusterSiblings);

    mockConversationRepository.findByIds.mockResolvedValue([
      { _id: 'conv-a', title: 'Seed A' },
      { _id: 'conv-b', title: 'Seed B' },
      { _id: 'conv-c', title: 'Neighbor C' },
      { _id: 'conv-d', title: 'Neighbor D' },
      { _id: 'conv-f', title: 'Cluster Sibling F' },
    ] as any);
    mockNoteRepository.getNote.mockResolvedValue({ _id: 'note-e', title: 'Note E' } as any);
  });

  describe('pipeline flow', () => {
    it('generates an embedding, fetches vector seeds, then queries graph neighbors and cluster siblings', async () => {
      const huggingfaceMock = jest.requireMock('../../src/shared/utils/huggingface') as {
        generateMiniLMEmbedding: jest.Mock;
      };
      const limit = 10;

      await searchService.graphRagSearch(userId, keyword, limit);

      expect(huggingfaceMock.generateMiniLMEmbedding).toHaveBeenCalledWith(keyword);
      expect(mockGraphVectorService.searchNodes).toHaveBeenCalledWith(
        userId,
        embedding,
        Math.max(limit * GRAPH_RAG_SEED_FETCH_MULTIPLIER, GRAPH_RAG_SEED_FETCH_MIN)
      );
      expect(mockMacroGraphStore.searchGraphRagNeighbors).toHaveBeenCalledWith(
        userId,
        ['conv-a', 'conv-b'],
        limit * GRAPH_RAG_NEIGHBOR_FETCH_MULTIPLIER
      );
      expect(mockMacroGraphStore.searchGraphRagClusterSiblings).toHaveBeenCalledWith(
        userId,
        ['conv-a', 'conv-b'],
        ['conv-a', 'conv-b', 'conv-c', 'conv-d', 'note-e'],
        Math.max(1, Math.floor(limit * GRAPH_RAG_CLUSTER_SIBLING_BUDGET_RATIO))
      );

      const embeddingOrder = huggingfaceMock.generateMiniLMEmbedding.mock.invocationCallOrder[0];
      const vectorOrder = mockGraphVectorService.searchNodes.mock.invocationCallOrder[0];
      const neighborOrder = mockMacroGraphStore.searchGraphRagNeighbors.mock.invocationCallOrder[0];
      const siblingOrder =
        mockMacroGraphStore.searchGraphRagClusterSiblings.mock.invocationCallOrder[0];
      expect(embeddingOrder).toBeLessThan(vectorOrder);
      expect(vectorOrder).toBeLessThan(neighborOrder);
      expect(neighborOrder).toBeLessThan(siblingOrder);
    });

    it('returns an empty result and skips Neo4j when no vector seeds survive', async () => {
      mockGraphVectorService.searchNodes.mockResolvedValue([]);

      const result = await searchService.graphRagSearch(userId, keyword, 10);

      expect(mockMacroGraphStore.searchGraphRagNeighbors).not.toHaveBeenCalled();
      expect(mockMacroGraphStore.searchGraphRagClusterSiblings).not.toHaveBeenCalled();
      expect(result).toEqual({ keyword, seedCount: 0, nodes: [] });
    });

    it('includes keyword, seedCount, title, and cluster metadata in the response', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      expect(result.keyword).toBe(keyword);
      expect(result.seedCount).toBe(2);
      expect(result.nodes.find((node) => node.origId === 'conv-a')).toEqual(
        expect.objectContaining({ title: 'Seed A from vector', clusterName: 'AI' })
      );
      expect(result.nodes.find((node) => node.origId === 'conv-c')).toEqual(
        expect.objectContaining({ title: 'Neighbor C', clusterName: 'AI' })
      );
      expect(result.nodes.find((node) => node.origId === 'note-e')).toEqual(
        expect.objectContaining({ title: 'Note E', clusterName: 'Research' })
      );
      expect(result.nodes.find((node) => node.origId === 'conv-f')).toEqual(
        expect.objectContaining({
          title: 'Cluster Sibling F',
          clusterName: 'AI',
          hopDistance: 9,
        })
      );
    });
  });

  describe('scoring and result shaping', () => {
    it('uses the vector score as the combined score for seed nodes', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const seedNodeA = result.nodes.find((node) => node.origId === 'conv-a');
      const seedNodeB = result.nodes.find((node) => node.origId === 'conv-b');

      expect(seedNodeA).toEqual(
        expect.objectContaining({ hopDistance: 0, combinedScore: 0.9, vectorScore: 0.9 })
      );
      expect(seedNodeB).toEqual(
        expect.objectContaining({ hopDistance: 0, combinedScore: 0.7, vectorScore: 0.7 })
      );
    });

    it('scores 1-hop neighbors with hop decay, edge weight, and the configured connection bonus', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const hop1Node = result.nodes.find((node) => node.origId === 'conv-c');
      const connectionBonus = GRAPH_RAG_CONNECTION_BONUS_RATE * (2 - 1);

      expect(hop1Node?.hopDistance).toBe(1);
      expect(hop1Node?.combinedScore).toBeCloseTo(
        0.9 * GRAPH_RAG_HOP_DECAY[1] * 0.8 * (1 + connectionBonus),
        4
      );
    });

    it('scores 2-hop neighbors with the configured 2-hop decay', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const hop2Node = result.nodes.find((node) => node.origId === 'note-e');

      expect(hop2Node?.hopDistance).toBe(2);
      expect(hop2Node?.combinedScore).toBeCloseTo(
        0.9 * GRAPH_RAG_HOP_DECAY[2] * 0.5,
        4
      );
    });

    it('scores cluster siblings with the sibling decay and marks them with hopDistance 9', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const siblingNode = result.nodes.find((node) => node.origId === 'conv-f');
      const connectionBonus = GRAPH_RAG_CONNECTION_BONUS_RATE * (2 - 1);

      expect(siblingNode?.hopDistance).toBe(9);
      expect(siblingNode?.combinedScore).toBeCloseTo(
        0.9 * GRAPH_RAG_CLUSTER_SIBLING_DECAY * (1 + connectionBonus),
        4
      );
    });

    it('sorts by combinedScore descending and slices to the requested limit', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 3);

      expect(result.nodes).toHaveLength(3);
      for (let i = 1; i < result.nodes.length; i++) {
        expect(result.nodes[i - 1].combinedScore).toBeGreaterThanOrEqual(
          result.nodes[i].combinedScore
        );
      }
      expect(result.nodes.map((node) => node.origId)).toEqual(['conv-a', 'conv-b', 'conv-c']);
    });
  });

  describe('error handling', () => {
    it('throws when graph dependencies are not configured', async () => {
      const serviceWithoutDeps = new SearchService(
        {} as ConversationRepository,
        {} as NoteRepository,
        {} as MessageRepository
      );

      await expect(serviceWithoutDeps.graphRagSearch(userId, keyword)).rejects.toThrow();
    });

    it('propagates embedding generation failures', async () => {
      const huggingfaceMock = jest.requireMock('../../src/shared/utils/huggingface') as {
        generateMiniLMEmbedding: jest.Mock;
      };
      huggingfaceMock.generateMiniLMEmbedding.mockRejectedValueOnce(
        new Error('embedding service failed') as never
      );

      await expect(searchService.graphRagSearch(userId, keyword)).rejects.toThrow(
        'embedding service failed'
      );
    });
  });
});

describe('SearchConversationsTool Graph RAG integration', () => {
  it('maps graphRagSearch results to tool nodes, clusters, and match sources', async () => {
    const { SearchConversationsTool } = await import(
      '../../src/agent/tools/SearchConversationsTool'
    );

    const mockSearchService = {
      graphRagSearch: jest.fn(),
    };
    mockSearchService.graphRagSearch.mockResolvedValue({
      keyword: graphRagKeyword,
      seedCount: 2,
      nodes: [
        {
          origId: 'conv-a',
          title: 'Seed A',
          nodeType: 'conversation',
          clusterName: 'AI',
          hopDistance: 0,
          combinedScore: 0.9,
          vectorScore: 0.9,
          connectionCount: 0,
        },
        {
          origId: 'conv-f',
          title: 'Cluster Sibling F',
          nodeType: 'conversation',
          clusterName: 'AI',
          hopDistance: 9,
          combinedScore: 0.405,
          connectionCount: 2,
        },
      ],
    } as never);

    const tool = new SearchConversationsTool();
    const result = await tool.execute(
      'user-001',
      { keyword: graphRagKeyword, limit: 10 },
      { searchService: mockSearchService } as any,
      {} as any
    );

    const parsed = JSON.parse(result);
    expect(mockSearchService.graphRagSearch).toHaveBeenCalledWith('user-001', graphRagKeyword, 10);
    expect(parsed.nodes).toEqual([
      expect.objectContaining({ id: 'conv-a', matchSource: 'vector_seed' }),
      expect.objectContaining({ id: 'conv-f', matchSource: 'cluster_sibling' }),
    ]);
    expect(parsed.clusters).toEqual([
      expect.objectContaining({
        clusterName: 'AI',
        nodeCount: 2,
        maxRelevanceScore: 0.9,
      }),
    ]);
    expect(parsed.search_summary.matchSourceBreakdown).toEqual({
      vector_seed: 1,
      cluster_sibling: 1,
    });
  });

  it('uses graphRagSearchMulti for comma-separated keywords', async () => {
    const { SearchConversationsTool } = await import(
      '../../src/agent/tools/SearchConversationsTool'
    );

    const mockSearchService = {
      graphRagSearch: jest.fn(),
      graphRagSearchMulti: jest.fn(),
    };
    mockSearchService.graphRagSearchMulti.mockResolvedValue({
      keyword: 'alpha, beta',
      seedCount: 0,
      nodes: [],
    } as never);

    const tool = new SearchConversationsTool();
    const result = await tool.execute(
      'user-001',
      { keyword: 'alpha, beta', limit: 5 },
      { searchService: mockSearchService } as any,
      {} as any
    );

    const parsed = JSON.parse(result);
    expect(mockSearchService.graphRagSearch).not.toHaveBeenCalled();
    expect(mockSearchService.graphRagSearchMulti).toHaveBeenCalledWith(
      'user-001',
      ['alpha', 'beta'],
      5
    );
    expect(parsed.nodes).toEqual([]);
  });

  it('returns an empty message when no graph results are found', async () => {
    const { SearchConversationsTool } = await import(
      '../../src/agent/tools/SearchConversationsTool'
    );

    const mockSearchService = {
      graphRagSearch: jest.fn(),
    };
    mockSearchService.graphRagSearch.mockResolvedValue({
      keyword: 'missing',
      seedCount: 0,
      nodes: [],
    } as never);

    const tool = new SearchConversationsTool();
    const result = await tool.execute(
      'user-001',
      { keyword: 'missing' },
      { searchService: mockSearchService } as any,
      {} as any
    );

    const parsed = JSON.parse(result);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.clusters).toEqual([]);
    expect(parsed.message).toEqual(expect.any(String));
  });
});
