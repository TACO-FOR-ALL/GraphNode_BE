/**
 * Graph RAG 파이프라인 하이퍼파라미터 설정
 *
 * 모든 값은 런타임에 변경하지 않는 상수입니다.
 * 실험·튜닝 시 이 파일의 값만 수정하면 파이프라인 전체에 반영됩니다.
 */

// ── Seed 품질 필터링 ──────────────────────────────────────────────────────────

/**
 * ChromaDB 벡터 검색 결과 중 그래프 확장 Seed로 허용할 최소 코사인 유사도.
 * 이 값 미만의 Seed는 Neo4j 탐색에 진입하지 못하고 폐기된다.
 *
 * 올리면: Seed 수 감소 → 탐색 범위 축소, 정밀도 향상, 노이즈 차단
 * 낮추면: Seed 수 증가 → 재현율 향상, 저품질 Seed 혼입 가능성 상승
 *
 * 배포 초기에는 보수적으로 낮게 설정하고 실험 데이터를 보며 높여나갈 것.
 */
export const GRAPH_RAG_VECTOR_MIN_SCORE = 0.3;

// ── Seed 수집 ─────────────────────────────────────────────────────────────────

/**
 * ChromaDB에서 가져올 Seed 후보 수 = floor(limit × SEED_FETCH_MULTIPLIER), 최솟값 SEED_FETCH_MIN.
 * 높이면 그래프 확장 범위가 넓어지지만 Neo4j 쿼리 파라미터 크기도 증가합니다.
 */
export const GRAPH_RAG_SEED_FETCH_MULTIPLIER = 2;
export const GRAPH_RAG_SEED_FETCH_MIN = 10;

/**
 * Neo4j GDS에서 반환받을 그래프 이웃 후보 수 = floor(limit × NEIGHBOR_FETCH_MULTIPLIER).
 * 1홉과 2홉 각각에 독립 적용됩니다.
 */
export const GRAPH_RAG_NEIGHBOR_FETCH_MULTIPLIER = 3;

// ── Hop 감쇄 ──────────────────────────────────────────────────────────────────

/**
 * 홉 거리별 점수 감쇄 계수.
 * - 1홉: Seed와 직접 연결된 노드. 0.8 = 벡터 점수의 80%를 상한으로 전파.
 * - 2홉: Seed로부터 중간 노드를 거친 노드. 0.5 = 50%로 급감.
 * - fallback: 정의되지 않은 홉 거리(오류 방어용). 0.3.
 */
export const GRAPH_RAG_HOP_DECAY: Record<number, number> = {
  1: 0.9,
  2: 0.8,
};
export const GRAPH_RAG_HOP_DECAY_FALLBACK = 0.3;

// ── 연결 보너스 ───────────────────────────────────────────────────────────────

/**
 * 이웃 노드가 여러 Seed와 연결될 때 적용하는 점수 보너스 비율.
 * connectionCount가 N이면 보너스 = CONNECTION_BONUS_RATE × (N - 1).
 *
 * 올리면: 허브 노드(다수 Seed와 연결된 중심 노드)가 순위 상단에 몰립니다.
 * 낮추면: Seed 연결 수 영향이 약해져 엣지 가중치(avgEdgeWeight)가 더 지배적이 됩니다.
 */
export const GRAPH_RAG_CONNECTION_BONUS_RATE = 0.15;

// ── 클러스터 가상 연결 확장 (고립 노드 보완) ─────────────────────────────────

/**
 * 물리적 엣지가 없는 클러스터 시블링 노드의 점수 감쇄 계수.
 * Seed와 같은 클러스터에 속하지만 MACRO_RELATED 엣지가 없는 경우에 적용된다.
 *
 * 1홉(0.9), 2홉(0.8)보다 낮게 설정해 직접 연결된 이웃보다 순위를 낮춘다.
 */
export const GRAPH_RAG_CLUSTER_SIBLING_DECAY = 0.45;

/**
 * 클러스터 시블링으로 채울 수 있는 최대 결과 비율.
 * limit이 10이고 비율이 0.4면, 최대 4개까지 클러스터 시블링을 포함한다.
 *
 * 올리면: 고립 노드(엣지 없음)가 결과에 더 많이 포함됨
 * 낮추면: 그래프 연결 기반 결과(1홉/2홉)가 더 지배적
 */
export const GRAPH_RAG_CLUSTER_SIBLING_BUDGET_RATIO = 0.4;

// ── 멀티 키워드 검색 ──────────────────────────────────────────────────────────

/**
 * 멀티 키워드 검색 시 단일 키워드로 가져올 최대 후보 수.
 * 최종 병합 후 limit으로 줄이므로 여유 있게 설정한다.
 */
export const GRAPH_RAG_MULTI_KEYWORD_PER_QUERY_LIMIT = 8;
