import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';
import { logger } from '../../shared/utils/logger';
import type { GraphRagNodeResult } from '../../shared/dtos/search';

/**
 * 대화 내용 검색 (Graph RAG) 도구 — 에이전트 전용 최적화 버전
 *
 * 검색 흐름:
 *   1. keyword 파싱 — 쉼표 구분 멀티 키워드 지원 (병렬 검색 후 merge)
 *   2. keyword → MiniLM embedding (SearchService 내부)
 *   3. ChromaDB top-K Seed 후보 추출 후 GRAPH_RAG_VECTOR_MIN_SCORE 미만 Seed 제거(Pruning)
 *   4. Neo4j MACRO_RELATED 관계 1홉/2홉 이웃 탐색 (Neo4jMacroGraphAdapter)
 *   5. 클러스터 가상 연결 확장 — 고립 노드(엣지 없음) 보완
 *   6. 점수 결합 랭킹 + 클러스터별 그룹화 출력
 *
 * matchSource 값:
 *   - "vector_seed"    : ChromaDB 벡터 직접 매칭 (hopDistance=0)
 *   - "graph_1hop"     : MACRO_RELATED 1홉 이웃 (hopDistance=1)
 *   - "graph_2hop"     : MACRO_RELATED 2홉 이웃 (hopDistance=2)
 *   - "cluster_sibling": 클러스터 가상 연결 (엣지 없음, hopDistance=9)
 *
 * relevanceScore 해석 가이드:
 *   - 0.7 이상: 높은 관련성 (Seed 직접 매칭 또는 강한 그래프 연결)
 *   - 0.4~0.7:  중간 관련성 (그래프 이웃, 맥락적 연관)
 *   - 0.2~0.4:  낮은 관련성 (클러스터 시블링, 간접 연관)
 *   - 0.2 미만: 매우 낮음 — 이 구간 노드만 존재하면 "자료 없음"으로 응답할 것
 */
export class SearchConversationsTool implements IAgentTool {
  readonly name = 'search_conversations';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'search_conversations',
      description: [
        '사용자의 과거 대화·노트·지식 노드 중에서 키워드와 의미적으로 유사한 내용을 검색합니다.',
        '벡터 유사도 검색(ChromaDB)과 지식 그래프 확장(Neo4j)을 결합한 Graph RAG 방식으로 작동합니다.',
        '',
        '## 멀티 키워드 사용법',
        '복합 질문("A가 B 역할일 때의 C 아이디어")은 핵심 엔티티를 쉼표로 구분해서 전달하세요.',
        '예시: keyword = "A, B 역할, C 아이디어"',
        '각 키워드는 독립적으로 검색되어 병합되므로, 그래프 상 서로 다른 위치에 있는 노드들도 발견됩니다.',
        '',
        '## 점수 산출 방식',
        '각 노드의 relevanceScore는 다음 공식으로 계산됩니다:',
        '  - Seed(벡터 직접 매칭): relevanceScore = vectorScore (코사인 유사도)',
        '  - 1홉 이웃: relevanceScore = maxSeedScore × 0.9 × avgEdgeWeight × (1 + 0.15×(연결Seed수-1))',
        '  - 2홉 이웃: relevanceScore = maxSeedScore × 0.8 × avgEdgeWeight × (1 + 0.15×(연결Seed수-1))',
        '  - 클러스터 시블링(엣지 없음): relevanceScore = maxSeedScore × 0.45 × (1 + 0.15×(연결Seed수-1))',
        'matchSource 필드로 매칭 방식을 확인할 수 있습니다.',
        '',
        '## 엄격한 의미 검사 (Strict Semantic Check) — 반드시 수행',
        '결과를 활용하기 전에 [질문 키워드 ↔ 노드 title ↔ 노드 내용] 세 가지 간의 논리적 일치성을 먼저 확인하십시오.',
        'relevanceScore 순서가 아니라 질문의 핵심 의도와의 실질적 연관성을 최우선 기준으로 삼으십시오.',
        '',
        '## matchSource 우선순위',
        '답변 근거로 활용할 때 아래 순서를 엄격히 따르십시오:',
        '  1순위 — vector_seed   (hopDistance=0): 벡터 직접 매칭. 가장 신뢰도가 높습니다.',
        '  2순위 — graph_1hop    (hopDistance=1): MACRO_RELATED 1홉 이웃. 맥락적으로 연관된 노드.',
        '  3순위 — graph_2hop    (hopDistance=2): MACRO_RELATED 2홉 이웃. 간접 연관.',
        '  사용 주의 — cluster_sibling (hopDistance=9): 물리적 엣지 없이 클러스터 소속만으로 포함된 노드.',
        '    → cluster_sibling은 title·내용이 질문과 직접 관련된 경우에만 근거로 사용하고,',
        '       관련 없는 내용이면 높은 relevanceScore에도 불구하고 반드시 제외하십시오.',
        '',
        '## 노이즈 제거 규칙 (반드시 준수)',
        '다음 조건을 모두 충족하는 노드는 답변 근거에서 즉시 제외하십시오:',
        '  - matchSource가 "cluster_sibling"이고,',
        '  - 노드의 title 또는 내용이 질문의 핵심 의도와 주제적으로 다른 경우.',
        '  예: "중국어 번역 방법" 질문에 "서울 날씨" 노드가 cluster_sibling으로 포함된 경우 → 제외.',
        '',
        '## 응답 제약 (반드시 준수)',
        '1. 검색 결과의 relevanceScore가 모두 0.2 미만이거나 nodes가 비어 있으면,',
        '   억지로 답변하지 말고 반드시 "관련된 자료를 찾을 수 없습니다"라고 답변하십시오.',
        '2. 노이즈 제거 후 남은 유효 노드가 없으면 "관련 자료를 찾을 수 없습니다"라고 답변하십시오.',
        '3. relevanceScore가 높더라도 노드의 title·nodeType이 질문 맥락과 다르면 근거로 사용하지 마십시오.',
        '4. 검색 결과에 없는 정보를 사용자의 과거 기록인 것처럼 언급하지 마십시오.',
        '5. clusters 배열을 활용해 주제별로 묶어서 설명하면 답변 품질이 향상됩니다.',
      ].join('\n'),
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description:
              '검색할 키워드. 복합 질문은 핵심 엔티티를 쉼표로 구분: "키워드A, 키워드B, 키워드C"',
          },
          limit: { type: 'number', description: '반환할 최대 결과 수 (기본값: 10)' },
        },
        required: ['keyword'],
      },
    },
  };

  /**
   * Graph RAG 검색 실행 (멀티 키워드 지원 + 클러스터 그룹 출력).
   *
   * @description
   * keyword를 쉼표로 분리해 멀티 키워드인 경우 병렬 검색 후 병합합니다.
   * 결과는 클러스터별로 그룹화하여 에이전트의 추론 품질을 높입니다.
   *
   * @param userId 사용자 ID
   * @param args 검색 파라미터 ({keyword: string, limit?: number})
   * @param deps AgentServiceDeps (searchService 포함)
   * @param openai OpenAI 인스턴스 (미사용)
   * @returns JSON 직렬화된 Graph RAG 검색 결과 문자열
   */
  async execute(
    userId: string,
    args: any,
    deps: AgentServiceDeps,
    openai: OpenAI
  ): Promise<string> {
    const { searchService } = deps;
    const rawKeyword = String(args.keyword ?? '').trim();
    const limit = Number(args.limit) || 10;

    if (!rawKeyword) {
      return JSON.stringify({ message: '검색 키워드를 입력해주세요.', nodes: [], clusters: [] });
    }

    // 쉼표로 구분된 멀티 키워드 파싱
    const keywords = rawKeyword
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const isMultiKeyword = keywords.length > 1;

    try {
      const result = isMultiKeyword
        ? await searchService.graphRagSearchMulti(userId, keywords, limit)
        : await searchService.graphRagSearch(userId, rawKeyword, limit);

      if (result.nodes.length === 0) {
        return JSON.stringify({
          message:
            '검색 결과가 없습니다. 지식 그래프가 아직 생성되지 않았거나, 관련 노드가 없습니다.',
          nodes: [],
          clusters: [],
        });
      }

      // 노드를 matchSource 기준으로 변환
      const mappedNodes = result.nodes.map((node: GraphRagNodeResult) => ({
        id: node.origId,
        title: node.title,
        nodeType: node.nodeType,
        clusterName: node.clusterName ?? '(클러스터 없음)',
        hopDistance: node.hopDistance,
        relevanceScore: Number(node.combinedScore.toFixed(4)),
        connectionCount: node.connectionCount,
        matchSource: resolveMatchSource(node.hopDistance),
      }));

      // 클러스터별 그룹화 (에이전트 추론 구조화)
      const clusterGroups = groupByCluster(mappedNodes);

      // 검색 요약 헤더
      const searchSummary = buildSearchSummary(
        keywords,
        result.seedCount,
        mappedNodes,
        clusterGroups.length,
        isMultiKeyword
      );

      logger.info(
        {
          userId,
          keywords,
          resultCount: mappedNodes.length,
          clusterCount: clusterGroups.length,
          isMultiKeyword,
        },
        '[SearchConversationsTool] Graph RAG 검색 완료'
      );

      return JSON.stringify({
        search_summary: searchSummary,
        clusters: clusterGroups,
        nodes: mappedNodes,
      });
    } catch (e: unknown) {
      logger.error(
        { err: e, userId, keywords },
        '[SearchConversationsTool] Graph RAG 검색 오류'
      );
      return JSON.stringify({
        message: '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        nodes: [],
        clusters: [],
      });
    }
  }
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

/**
 * hopDistance로 matchSource 문자열을 결정합니다.
 * hopDistance=9는 클러스터 시블링(물리적 엣지 없음)을 나타내는 sentinel입니다.
 */
function resolveMatchSource(hopDistance: number): string {
  if (hopDistance === 0) return 'vector_seed';
  if (hopDistance === 9) return 'cluster_sibling';
  return `graph_${hopDistance}hop`;
}

type MappedNode = {
  clusterName: string;
  relevanceScore: number;
  id: string;
  title: string | null;
  nodeType: string;
  hopDistance: number;
  connectionCount: number;
  matchSource: string;
};

/**
 * 노드 목록을 clusterName 기준으로 그룹화합니다.
 * 각 클러스터는 내부 노드를 relevanceScore 내림차순으로 정렬하고,
 * 클러스터 목록도 maxRelevanceScore 내림차순으로 정렬합니다.
 */
function groupByCluster(
  nodes: MappedNode[]
): Array<{ clusterName: string; nodeCount: number; maxRelevanceScore: number; nodes: MappedNode[] }> {
  const map = new Map<string, MappedNode[]>();

  for (const node of nodes) {
    const key = node.clusterName || '(클러스터 없음)';
    const list = map.get(key) ?? [];
    list.push(node);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([clusterName, clusterNodes]) => {
      const sorted = [...clusterNodes].sort((a, b) => b.relevanceScore - a.relevanceScore);
      return {
        clusterName,
        nodeCount: sorted.length,
        maxRelevanceScore: Number((sorted[0]?.relevanceScore ?? 0).toFixed(4)),
        nodes: sorted,
      };
    })
    .sort((a, b) => b.maxRelevanceScore - a.maxRelevanceScore);
}

/**
 * 검색 결과 요약 헤더를 생성합니다.
 */
function buildSearchSummary(
  keywords: string[],
  seedCount: number,
  nodes: MappedNode[],
  clusterCount: number,
  isMultiKeyword: boolean
): Record<string, unknown> {
  const avgScore =
    nodes.length > 0
      ? Number((nodes.reduce((s, n) => s + n.relevanceScore, 0) / nodes.length).toFixed(4))
      : 0;

  const matchSourceCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.matchSource] = (acc[n.matchSource] ?? 0) + 1;
    return acc;
  }, {});

  return {
    queriedKeywords: keywords,
    isMultiKeyword,
    totalNodes: nodes.length,
    seedCount,
    clusterCount,
    averageRelevanceScore: avgScore,
    matchSourceBreakdown: matchSourceCounts,
  };
}
