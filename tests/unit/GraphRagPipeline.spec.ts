import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { SearchService } from '../../src/core/services/SearchService';
import type { MacroGraphStore, GraphRagNeighborResult } from '../../src/core/ports/MacroGraphStore';
import { GraphVectorService } from '../../src/core/services/GraphVectorService';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { NoteRepository } from '../../src/core/ports/NoteRepository';
import type { MessageRepository } from '../../src/core/ports/MessageRepository';

// huggingface.ts 임베딩 함수를 모킹합니다 (외부 HTTP 호출 방지).
jest.mock('../../src/shared/utils/huggingface', () => ({
  generateMiniLMEmbedding: jest.fn(),
}));

/**
 * GraphRagPipeline 단위 테스트
 *
 * 검증 대상:
 *  1. SearchService.graphRagSearch() - 전체 파이프라인 흐름
 *  2. 스코어링 알고리즘 (seed, 1홉, 2홉)
 *  3. SearchConversationsTool의 graphRagSearch 호출
 */
describe('SearchService.graphRagSearch()', () => {
  let searchService: SearchService;
  let mockGraphVectorService: jest.Mocked<GraphVectorService>;
  let mockMacroGraphStore: jest.Mocked<MacroGraphStore>;

  const userId = 'user-test-001';
  const keyword = '딥러닝';

  // ChromaDB seed 검색 결과 픽스처
  const mockSeedResults = [
    {
      node: { id: 1, userId, origId: 'conv-a', clusterId: 'c1', clusterName: 'AI', numMessages: 10, timestamp: null },
      score: 0.9,
    },
    {
      node: { id: 2, userId, origId: 'conv-b', clusterId: 'c1', clusterName: 'AI', numMessages: 5, timestamp: null },
      score: 0.7,
    },
  ];

  // Neo4j 1홉 이웃 픽스처
  const mockNeighbors1Hop: GraphRagNeighborResult[] = [
    {
      origId: 'conv-c',
      nodeId: 3,
      nodeType: 'conversation',
      hopDistance: 1,
      connectedSeeds: ['conv-a', 'conv-b'], // 2개 seed와 연결 → connectionCount=2
      avgEdgeWeight: 0.8,
      connectionCount: 2,
    },
    {
      origId: 'conv-d',
      nodeId: 4,
      nodeType: 'conversation',
      hopDistance: 1,
      connectedSeeds: ['conv-a'],
      avgEdgeWeight: 0.6,
      connectionCount: 1,
    },
  ];

  // Neo4j 2홉 이웃 픽스처 (1홉과 겹치지 않는 origId)
  const mockNeighbors2Hop: GraphRagNeighborResult[] = [
    {
      origId: 'conv-e',
      nodeId: 5,
      nodeType: 'note',
      hopDistance: 2,
      connectedSeeds: ['conv-a'],
      avgEdgeWeight: 0.5,
      connectionCount: 1,
    },
  ];

  beforeEach(() => {
    mockGraphVectorService = {
      searchNodes: jest.fn(),
      saveGraphFeatures: jest.fn(),
    } as unknown as jest.Mocked<GraphVectorService>;

    mockMacroGraphStore = {
      searchGraphRagNeighbors: jest.fn(),
    } as unknown as jest.Mocked<MacroGraphStore>;

    searchService = new SearchService(
      {} as ConversationRepository,
      {} as NoteRepository,
      {} as MessageRepository,
      mockGraphVectorService,
      mockMacroGraphStore
    );

    // 기본 mock 동작 설정
    (mockGraphVectorService.searchNodes as any).mockResolvedValue(mockSeedResults);
    (mockMacroGraphStore.searchGraphRagNeighbors as any).mockResolvedValue([
      ...mockNeighbors1Hop,
      ...mockNeighbors2Hop,
    ]);

    // 임베딩 mock 초기화
    const huggingfaceMock = jest.requireMock('../../src/shared/utils/huggingface') as any;
    huggingfaceMock.generateMiniLMEmbedding.mockResolvedValue(Array(384).fill(0.1));
  });

  describe('파이프라인 흐름 검증', () => {
    it('keyword → embedding → ChromaDB → Neo4j 순서로 호출되어야 합니다', async () => {
      const huggingfaceMock = jest.requireMock('../../src/shared/utils/huggingface') as any;

      await searchService.graphRagSearch(userId, keyword, 10);

      // Phase 1: 임베딩 호출 확인
      expect(huggingfaceMock.generateMiniLMEmbedding).toHaveBeenCalledWith(keyword);

      // Phase 2: ChromaDB 벡터 검색 호출 확인
      expect(mockGraphVectorService.searchNodes).toHaveBeenCalledWith(
        userId,
        expect.any(Array),
        expect.any(Number)
      );

      // Phase 3: Neo4j 이웃 탐색 호출 확인 (seed origIds 전달)
      expect(mockMacroGraphStore.searchGraphRagNeighbors).toHaveBeenCalledWith(
        userId,
        expect.arrayContaining(['conv-a', 'conv-b']),
        expect.any(Number)
      );
    });

    it('seed 노드가 없으면 Neo4j 탐색을 호출하지 않고 빈 결과를 반환해야 합니다', async () => {
      (mockGraphVectorService.searchNodes as any).mockResolvedValue([]);

      const result = await searchService.graphRagSearch(userId, keyword, 10);

      expect(mockMacroGraphStore.searchGraphRagNeighbors).not.toHaveBeenCalled();
      expect(result.seedCount).toBe(0);
      expect(result.nodes).toHaveLength(0);
    });

    it('결과에 keyword와 seedCount가 올바르게 포함되어야 합니다', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      expect(result.keyword).toBe(keyword);
      expect(result.seedCount).toBe(2); // conv-a, conv-b
    });
  });

  describe('스코어링 알고리즘 검증', () => {
    it('Seed 노드(0홉)의 combinedScore는 vectorScore와 같아야 합니다', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const seedNodeA = result.nodes.find((n) => n.origId === 'conv-a');
      const seedNodeB = result.nodes.find((n) => n.origId === 'conv-b');

      expect(seedNodeA?.hopDistance).toBe(0);
      expect(seedNodeA?.combinedScore).toBeCloseTo(0.9);
      expect(seedNodeA?.vectorScore).toBeCloseTo(0.9);

      expect(seedNodeB?.hopDistance).toBe(0);
      expect(seedNodeB?.combinedScore).toBeCloseTo(0.7);
    });

    it('1홉 이웃의 combinedScore는 hopDecay(0.8) × avgEdgeWeight × connectionBonus를 반영해야 합니다', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const hop1NodeC = result.nodes.find((n) => n.origId === 'conv-c');

      // conv-c: maxSeedScore=0.9, hopDecay=0.8, avgEdgeWeight=0.8, connectionCount=2
      // connectionBonus = 0.15 × (2-1) = 0.15
      // combinedScore = 0.9 × 0.8 × 0.8 × (1 + 0.15) ≈ 0.6624
      expect(hop1NodeC?.hopDistance).toBe(1);
      expect(hop1NodeC?.combinedScore).toBeCloseTo(0.9 * 0.8 * 0.8 * 1.15, 4);
    });

    it('2홉 이웃의 combinedScore는 hopDecay(0.5)를 반영해야 합니다', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      const hop2NodeE = result.nodes.find((n) => n.origId === 'conv-e');

      // conv-e: maxSeedScore=0.9, hopDecay=0.5, avgEdgeWeight=0.5, connectionCount=1
      // connectionBonus = 0 (connectionCount=1 → 보너스 없음)
      // combinedScore = 0.9 × 0.5 × 0.5 × 1.0 = 0.225
      expect(hop2NodeE?.hopDistance).toBe(2);
      expect(hop2NodeE?.combinedScore).toBeCloseTo(0.9 * 0.5 * 0.5 * 1.0, 4);
    });

    it('결과가 combinedScore 내림차순으로 정렬되어야 합니다', async () => {
      const result = await searchService.graphRagSearch(userId, keyword, 10);

      for (let i = 1; i < result.nodes.length; i++) {
        expect(result.nodes[i - 1].combinedScore).toBeGreaterThanOrEqual(
          result.nodes[i].combinedScore
        );
      }
    });

    it('limit를 초과하는 노드는 잘려야 합니다', async () => {
      // seed 2개 + 이웃 3개 = 총 5개인데 limit=3으로 제한
      const result = await searchService.graphRagSearch(userId, keyword, 3);

      expect(result.nodes.length).toBeLessThanOrEqual(3);
    });
  });

  describe('오류 처리', () => {
    it('graphVectorService/macroGraphStore가 없으면 에러를 던져야 합니다', async () => {
      const serviceWithoutDeps = new SearchService(
        {} as ConversationRepository,
        {} as NoteRepository,
        {} as MessageRepository
        // graphVectorService, macroGraphStore 미주입
      );

      await expect(serviceWithoutDeps.graphRagSearch(userId, keyword)).rejects.toThrow();
    });

    it('임베딩 생성 실패 시 에러가 전파되어야 합니다', async () => {
      const huggingfaceMock = jest.requireMock('../../src/shared/utils/huggingface') as any;
      huggingfaceMock.generateMiniLMEmbedding.mockRejectedValueOnce(
        new Error('HuggingFace 서버 오류')
      );

      await expect(searchService.graphRagSearch(userId, keyword)).rejects.toThrow(
        'HuggingFace 서버 오류'
      );
    });
  });
});

describe('SearchConversationsTool Graph RAG 통합', () => {
  it('AgentServiceDeps에서 searchService.graphRagSearch를 호출해야 합니다', async () => {
    const { SearchConversationsTool } = await import(
      '../../src/agent/tools/SearchConversationsTool'
    );

    const mockSearchService = {
      graphRagSearch: jest.fn() as any,
    };
    (mockSearchService.graphRagSearch as any).mockResolvedValue({
      keyword: '딥러닝',
      seedCount: 2,
      nodes: [
        { origId: 'conv-a', nodeType: 'conversation', hopDistance: 0, combinedScore: 0.9, vectorScore: 0.9, connectionCount: 0 },
        { origId: 'conv-c', nodeType: 'conversation', hopDistance: 1, combinedScore: 0.66, connectionCount: 2 },
      ],
    });

    const tool = new SearchConversationsTool();
    const result = await tool.execute(
      'user-001',
      { keyword: '딥러닝', limit: 10 },
      { searchService: mockSearchService } as any,
      {} as any
    );

    const parsed = JSON.parse(result);
    expect(mockSearchService.graphRagSearch).toHaveBeenCalledWith('user-001', '딥러닝', 10);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0].matchSource).toBe('vector_seed');
    expect(parsed.nodes[1].matchSource).toBe('graph_1hop');
  });

  it('결과가 없으면 안내 메시지를 반환해야 합니다', async () => {
    const { SearchConversationsTool } = await import(
      '../../src/agent/tools/SearchConversationsTool'
    );

    const mockSearchService = {
      graphRagSearch: jest.fn() as any,
    };
    (mockSearchService.graphRagSearch as any).mockResolvedValue({
      keyword: '없는키워드',
      seedCount: 0,
      nodes: [],
    });

    const tool = new SearchConversationsTool();
    const result = await tool.execute(
      'user-001',
      { keyword: '없는키워드' },
      { searchService: mockSearchService } as any,
      {} as any
    );

    const parsed = JSON.parse(result);
    expect(parsed.nodes).toHaveLength(0);
    expect(parsed.message).toContain('없습니다');
  });
});
