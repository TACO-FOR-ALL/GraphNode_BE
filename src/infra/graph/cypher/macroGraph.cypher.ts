/**
 * @description Macro Graph Neo4j 마이그레이션에 필요한 schema/index Cypher 목록입니다.
 *
 * 이 파일의 목적은 MongoDB의 Macro Graph 문서를 Neo4j의 관계 기반 구조로 저장할 수 있도록
 * 기본 constraint와 조회 index만 준비하는 것입니다.
 */
export const MACRO_GRAPH_SCHEMA_CYPHER = [
  /** [제약조건] 사용자별 Macro Graph 루트 노드를 하나로 제한합니다. */
  'CREATE CONSTRAINT macro_graph_user_unique IF NOT EXISTS FOR (g:MacroGraph) REQUIRE g.userId IS UNIQUE',
  /** [제약조건] 사용자별 graph node id를 유일하게 유지합니다. */
  'CREATE CONSTRAINT macro_node_identity_unique IF NOT EXISTS FOR (n:MacroNode) REQUIRE (n.userId, n.id) IS UNIQUE',
  /** [제약조건] 사용자별 cluster id를 유일하게 유지합니다. */
  'CREATE CONSTRAINT macro_cluster_identity_unique IF NOT EXISTS FOR (c:MacroCluster) REQUIRE (c.userId, c.id) IS UNIQUE',
  /** [제약조건] 사용자별 subcluster id를 유일하게 유지합니다. */
  'CREATE CONSTRAINT macro_subcluster_identity_unique IF NOT EXISTS FOR (sc:MacroSubcluster) REQUIRE (sc.userId, sc.id) IS UNIQUE',
  /** [제약조건] 사용자별 relation id를 유일하게 유지합니다. */
  'CREATE CONSTRAINT macro_relation_identity_unique IF NOT EXISTS FOR (r:MacroRelation) REQUIRE (r.userId, r.id) IS UNIQUE',
  /** [제약조건] 사용자별 stats 노드를 하나로 제한합니다. */
  'CREATE CONSTRAINT macro_stats_user_unique IF NOT EXISTS FOR (st:MacroStats) REQUIRE st.userId IS UNIQUE',
  /** [제약조건] 사용자별 summary 노드를 하나로 제한합니다. */
  'CREATE CONSTRAINT macro_summary_user_unique IF NOT EXISTS FOR (sm:MacroSummary) REQUIRE sm.userId IS UNIQUE',
  /** [인덱스] 원천 데이터 ID로 MacroNode를 빠르게 찾기 위한 인덱스입니다. */
  'CREATE INDEX macro_node_orig IF NOT EXISTS FOR (n:MacroNode) ON (n.userId, n.origId)',
  /** [인덱스] source type별 graph 조회와 집계를 위한 인덱스입니다. */
  'CREATE INDEX macro_node_type IF NOT EXISTS FOR (n:MacroNode) ON (n.userId, n.nodeType)',
  /** [인덱스] soft delete 필터링을 위한 node 삭제 시각 인덱스입니다. */
  'CREATE INDEX macro_node_deleted IF NOT EXISTS FOR (n:MacroNode) ON (n.userId, n.deletedAt)',
  /** [인덱스] cluster 이름 기반 조회와 정렬을 보조합니다. */
  'CREATE INDEX macro_cluster_name IF NOT EXISTS FOR (c:MacroCluster) ON (c.userId, c.name)',
  /** [인덱스] relation 타입별 조회와 집계를 보조합니다. */
  'CREATE INDEX macro_relation_type IF NOT EXISTS FOR (r:MacroRelation) ON (r.userId, r.type)',
  /** [전문검색] 원천 ID, source type, MIME 타입 기반 MacroNode 검색을 지원합니다. */
  'CREATE FULLTEXT INDEX macro_node_text IF NOT EXISTS FOR (n:MacroNode) ON EACH [n.origId, n.nodeType, n.mimeType]',
  /** [전문검색] cluster 이름과 설명 기반 검색을 지원합니다. */
  'CREATE FULLTEXT INDEX macro_cluster_text IF NOT EXISTS FOR (c:MacroCluster) ON EACH [c.name, c.description]',
] as const;
