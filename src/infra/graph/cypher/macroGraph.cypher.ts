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

/**
 * @description Macro Graph Neo4j 런타임 Cypher 쿼리 모음입니다.
 *
 * 이 객체는 `Neo4jMacroGraphAdapter`가 사용하는 모든 DML Cypher를 중앙화합니다.
 * snapshot/hash/version 관련 쿼리는 포함하지 않습니다.
 * 관계가 single source of truth이며, 파생 count는 관계 집계로 복원합니다.
 */
export const MACRO_GRAPH_CYPHER = {
  /**
   * @description 사용자 Macro Graph 루트 노드를 생성하거나 updatedAt을 갱신합니다.
   *
   * @param userId 대상 사용자 ID
   * @param now 현재 ISO 시각
   */
  upsertGraphRoot: `
    MERGE (g:MacroGraph {userId: $userId})
    ON CREATE SET g.createdAt = $now, g.updatedAt = $now
    ON MATCH  SET g.updatedAt = $now
  `,

  /**
   * @description MacroNode 목록을 UNWIND 기반 batch upsert 합니다.
   *
   * `clusterId`, `clusterName`은 저장하지 않습니다. BELONGS_TO 관계로 복원합니다.
   *
   * @param rows Neo4jMacroNode 속성 배열 (`Neo4jMacroGraphAdapter.ts` 내부 변환 로직 참조)
   * @example
   * // rows 파라미터 구조 예시:
   * // [
   * //   {
   * //     userId: 'user-123',
   * //     id: 1,
   * //     origId: 'doc-123',
   * //     nodeType: 'conversation',
   * //     fileType: null,
   * //     mimeType: null,
   * //     timestamp: 1620000000,
   * //     numMessages: 5,
   * //     embedding: [0.1, 0.2, ...],
   * //     createdAt: '2024-01-01T00:00:00Z',
   * //     updatedAt: '2024-01-01T00:00:00Z',
   * //     deletedAt: null
   * //   }
   * // ]
   */
  upsertNodes: `
    UNWIND $rows AS row
    MERGE (n:MacroNode {userId: row.userId, id: row.id})
    SET n.origId       = row.origId,
        n.nodeType     = row.nodeType,
        n.fileType     = row.fileType,
        n.mimeType     = row.mimeType,
        n.timestamp    = row.timestamp,
        n.numMessages  = row.numMessages,
        n.embedding    = row.embedding,
        n.createdAt    = row.createdAt,
        n.updatedAt    = row.updatedAt,
        n.deletedAt    = row.deletedAt
  `,

  /**
   * @description MacroCluster 목록을 UNWIND 기반 batch upsert 합니다.
   *
   * `size`는 저장하지 않습니다. BELONGS_TO 관계 count로 복원합니다.
   *
   * @param rows Neo4jMacroClusterNode 속성 배열
   * @example
   * // rows 파라미터 구조 예시:
   * // [
   * //   {
   * //     userId: 'user-123',
   * //     id: 'cluster-1',
   * //     name: 'AI 기술',
   * //     description: 'AI 관련 문서 모음',
   * //     themes: '["AI", "ML"]',
   * //     createdAt: '2024-01-01T00:00:00Z',
   * //     updatedAt: '2024-01-01T00:00:00Z',
   * //     deletedAt: null
   * //   }
   * // ]
   */
  upsertClusters: `
    UNWIND $rows AS row
    MERGE (c:MacroCluster {userId: row.userId, id: row.id})
    SET c.name        = row.name,
        c.description = row.description,
        c.themes      = row.themes,
        c.createdAt   = row.createdAt,
        c.updatedAt   = row.updatedAt,
        c.deletedAt   = row.deletedAt
  `,

  /**
   * @description MacroSubcluster 목록을 UNWIND 기반 batch upsert 합니다.
   *
   * `clusterId`, `nodeIds`, `representativeNodeId`, `size`, `density`는 저장하지 않습니다.
   * HAS_SUBCLUSTER, CONTAINS, REPRESENTS 관계와 집계로 복원합니다.
   *
   * @param rows Neo4jMacroSubclusterNode 속성 배열
   * @example
   * // rows 파라미터 구조 예시:
   * // [
   * //   {
   * //     userId: 'user-123',
   * //     id: 'subcluster-1',
   * //     topKeywords: '["Deep Learning"]',
   * //     density: 0.85,
   * //     createdAt: '2024-01-01T00:00:00Z',
   * //     updatedAt: '2024-01-01T00:00:00Z',
   * //     deletedAt: null
   * //   }
   * // ]
   */
  upsertSubclusters: `
    UNWIND $rows AS row
    MERGE (sc:MacroSubcluster {userId: row.userId, id: row.id})
    SET sc.topKeywords = row.topKeywords,
        sc.density     = row.density,
        sc.createdAt   = row.createdAt,
        sc.updatedAt   = row.updatedAt,
        sc.deletedAt   = row.deletedAt
  `,

  /**
   * @description MacroRelation (reified edge) 목록을 UNWIND 기반 batch upsert 합니다.
   *
   * `source`, `target`은 저장하지 않습니다. RELATES_SOURCE/RELATES_TARGET 관계가
   * single source of truth입니다.
   *
   * @param rows Neo4jMacroRelationNode 속성 배열
   * @example
   * // rows 파라미터 구조 예시:
   * // [
   * //   {
   * //     userId: 'user-123',
   * //     id: 'edge-1',
   * //     weight: 0.9,
   * //     type: 'semantic',
   * //     intraCluster: true,
   * //     createdAt: '2024-01-01T00:00:00Z',
   * //     updatedAt: '2024-01-01T00:00:00Z',
   * //     deletedAt: null
   * //   }
   * // ]
   */
  upsertRelations: `
    UNWIND $rows AS row
    MERGE (r:MacroRelation {userId: row.userId, id: row.id})
    SET r.weight       = row.weight,
        r.type         = row.type,
        r.intraCluster = row.intraCluster,
        r.createdAt    = row.createdAt,
        r.updatedAt    = row.updatedAt,
        r.deletedAt    = row.deletedAt
  `,

  /**
   * @description MacroStats 노드를 upsert 합니다.
   *
   * `nodes`, `edges`, `clusters` count는 저장하지 않습니다. 조회 시 집계로 복원합니다.
   *
   * @param userId 사용자 ID
   * @param id stats id (일반적으로 userId와 동일)
   * @param status graph 생성 상태
   * @param generatedAt AI pipeline 생성 시각
   * @param updatedAt stats 수정 시각
   * @param metadataJson 부가 metadata JSON 문자열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   id: '...',
   * //   status: '...',
   * //   generatedAt: '...',
   * //   updatedAt: '...',
   * //   metadataJson: '...',
   * // }
   */
  upsertStats: `
    MERGE (st:MacroStats {userId: $userId})
    SET st.id           = $id,
        st.status       = $status,
        st.generatedAt  = $generatedAt,
        st.updatedAt    = $updatedAt,
        st.metadataJson = $metadataJson
  `,

  /**
   * @description MacroSummary 노드를 upsert 합니다.
   *
   * overview count와 cluster size는 조회 시 관계 집계로 복원합니다.
   *
   * @param userId 사용자 ID
   * @param id summary id
   * @param overviewJson count 필드를 제외한 overview JSON
   * @param clustersJson size 필드를 제외한 cluster analysis JSON
   * @param patternsJson pattern JSON
   * @param connectionsJson connection JSON
   * @param recommendationsJson recommendation JSON
   * @param generatedAt summary 생성 시각
   * @param detailLevel summary 상세 수준
   * @param deletedAt soft delete 시각
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   id: '...',
   * //   overviewJson: '...',
   * //   clustersJson: '...',
   * //   patternsJson: '...',
   * //   connectionsJson: '...',
   * //   recommendationsJson: '...',
   * //   generatedAt: '...',
   * //   detailLevel: '...',
   * //   deletedAt: '...',
   * // }
   */
  upsertSummary: `
    MERGE (sm:MacroSummary {userId: $userId})
    SET sm.id                   = $id,
        sm.overviewJson         = $overviewJson,
        sm.clustersJson         = $clustersJson,
        sm.patternsJson         = $patternsJson,
        sm.connectionsJson      = $connectionsJson,
        sm.recommendationsJson  = $recommendationsJson,
        sm.generatedAt          = $generatedAt,
        sm.detailLevel          = $detailLevel,
        sm.deletedAt            = $deletedAt
  `,

  /**
   * @description 사용자의 모든 MacroNode를 MacroGraph 루트에 HAS_NODE로 연결합니다.
   *
   * @param userId 사용자 ID
   * @param rows id(number) 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkNodesToGraph: `
    UNWIND $rows AS row
    MATCH (g:MacroGraph {userId: $userId})
    MATCH (n:MacroNode {userId: $userId, id: row.id})
    MERGE (g)-[:HAS_NODE]->(n)
  `,

  /**
   * @description 사용자의 모든 MacroCluster를 MacroGraph 루트에 HAS_CLUSTER로 연결합니다.
   *
   * @param userId 사용자 ID
   * @param rows id(string) 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkClustersToGraph: `
    UNWIND $rows AS row
    MATCH (g:MacroGraph {userId: $userId})
    MATCH (c:MacroCluster {userId: $userId, id: row.id})
    MERGE (g)-[:HAS_CLUSTER]->(c)
  `,

  /**
   * @description 사용자의 모든 MacroSubcluster를 MacroGraph 루트에 HAS_SUBCLUSTER로 연결합니다.
   *
   * @param userId 사용자 ID
   * @param rows id(string) 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkSubclustersToGraph: `
    UNWIND $rows AS row
    MATCH (g:MacroGraph {userId: $userId})
    MATCH (sc:MacroSubcluster {userId: $userId, id: row.id})
    MERGE (g)-[:HAS_SUBCLUSTER]->(sc)
  `,

  /**
   * @description 사용자의 모든 MacroRelation을 MacroGraph 루트에 HAS_RELATION으로 연결합니다.
   *
   * @param userId 사용자 ID
   * @param rows id(string) 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkRelationsToGraph: `
    UNWIND $rows AS row
    MATCH (g:MacroGraph {userId: $userId})
    MATCH (r:MacroRelation {userId: $userId, id: row.id})
    MERGE (g)-[:HAS_RELATION]->(r)
  `,

  /**
   * @description MacroStats 노드를 MacroGraph 루트에 HAS_STATS로 연결합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  linkStatsToGraph: `
    MATCH (g:MacroGraph {userId: $userId})
    MATCH (st:MacroStats {userId: $userId})
    MERGE (g)-[:HAS_STATS]->(st)
  `,

  /**
   * @description MacroSummary 노드를 MacroGraph 루트에 HAS_SUMMARY로 연결합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  linkSummaryToGraph: `
    MATCH (g:MacroGraph {userId: $userId})
    MATCH (sm:MacroSummary {userId: $userId})
    MERGE (g)-[:HAS_SUMMARY]->(sm)
  `,

  /**
   * @description MacroNode와 소속 MacroCluster 사이에 BELONGS_TO 관계를 생성합니다.
   *
   * @param userId 사용자 ID
   * @param rows {nodeId: number, clusterId: string} 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkNodeBelongsToCluster: `
    UNWIND $rows AS row
    MATCH (n:MacroNode {userId: $userId, id: row.nodeId})
    MATCH (c:MacroCluster {userId: $userId, id: row.clusterId})
    MERGE (n)-[:BELONGS_TO]->(c)
  `,

  /**
   * @description MacroCluster와 소속 MacroSubcluster 사이에 HAS_SUBCLUSTER 관계를 생성합니다.
   *
   * @param userId 사용자 ID
   * @param rows {clusterId: string, subclusterId: string} 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkSubclusterToCluster: `
    UNWIND $rows AS row
    MATCH (cl:MacroCluster    {userId: $userId, id: row.clusterId})
    MATCH (sc:MacroSubcluster {userId: $userId, id: row.subclusterId})
    MERGE (cl)-[:HAS_SUBCLUSTER]->(sc)
  `,

  /**
   * @description MacroSubcluster와 포함 MacroNode 사이에 CONTAINS 관계를 생성합니다.
   *
   * @param userId 사용자 ID
   * @param rows {subclusterId: string, nodeId: number} 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkSubclusterContainsNodes: `
    UNWIND $rows AS row
    MATCH (sc:MacroSubcluster {userId: $userId, id: row.subclusterId})
    MATCH (n:MacroNode         {userId: $userId, id: row.nodeId})
    MERGE (sc)-[:CONTAINS]->(n)
  `,

  /**
   * @description MacroSubcluster와 대표 MacroNode 사이에 REPRESENTS 관계를 생성합니다.
   *
   * @param userId 사용자 ID
   * @param rows {subclusterId: string, nodeId: number} 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkSubclusterRepresentsNode: `
    UNWIND $rows AS row
    MATCH (sc:MacroSubcluster {userId: $userId, id: row.subclusterId})
    MATCH (n:MacroNode         {userId: $userId, id: row.nodeId})
    MERGE (sc)-[:REPRESENTS]->(n)
  `,

  /**
   * @description MacroRelation 노드의 source/target endpoint를 RELATES_SOURCE/RELATES_TARGET 관계로 연결합니다.
   *
   * @param userId 사용자 ID
   * @param rows {edgeId: string, source: number, target: number} 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkRelationEndpoints: `
    UNWIND $rows AS row
    MATCH (rel:MacroRelation {userId: $userId, id: row.edgeId})
    MATCH (src:MacroNode     {userId: $userId, id: row.source})
    MATCH (tgt:MacroNode     {userId: $userId, id: row.target})
    MERGE (rel)-[:RELATES_SOURCE]->(src)
    MERGE (rel)-[:RELATES_TARGET]->(tgt)
  `,

  /**
   * @description traversal 성능을 위해 MacroNode 간에 MACRO_RELATED materialized 관계를 생성합니다.
   *
   * @param userId 사용자 ID
   * @param rows {edgeId: string, source: number, target: number, weight: number, type: string, intraCluster: boolean} 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   rows: '...',
   * // }
   */
  linkMaterializedMacroRelated: `
    UNWIND $rows AS row
    MATCH (src:MacroNode {userId: $userId, id: row.source})
    MATCH (tgt:MacroNode {userId: $userId, id: row.target})
    MERGE (src)-[r:MACRO_RELATED {id: row.edgeId, userId: $userId}]->(tgt)
    SET r.weight       = row.weight,
        r.type         = row.type,
        r.intraCluster = row.intraCluster,
        r.deletedAt    = row.deletedAt
  `,

  /**
   * @description 사용자의 활성 MacroNode 목록을 BELONGS_TO 관계에서 cluster 정보와 함께 조회합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  listNodes: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
    WHERE $includeDeleted OR n.deletedAt IS NULL
    OPTIONAL MATCH (n)-[:BELONGS_TO]->(c:MacroCluster {userId: $userId})
    RETURN n, coalesce(c.id, '') AS clusterId, coalesce(c.name, '') AS clusterName
  `,

  /**
   * @description id로 단일 MacroNode를 cluster 정보와 함께 조회합니다.
   *
   * @param userId 사용자 ID
   * @param id graph node id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   id: '...',
   * // }
   */
  findNode: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId, id: $id})
    WHERE $includeDeleted OR n.deletedAt IS NULL
    OPTIONAL MATCH (n)-[:BELONGS_TO]->(c:MacroCluster {userId: $userId})
    RETURN n, coalesce(c.id, '') AS clusterId, coalesce(c.name, '') AS clusterName
  `,

  /**
   * @description origId 목록으로 MacroNode를 cluster 정보와 함께 조회합니다.
   *
   * @param userId 사용자 ID
   * @param origIds 원천 데이터 ID 목록
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   origIds: '...',
   * // }
   */
  findNodesByOrigIds: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
    WHERE n.origId IN $origIds AND ($includeDeleted OR n.deletedAt IS NULL)
    OPTIONAL MATCH (n)-[:BELONGS_TO]->(c:MacroCluster {userId: $userId})
    RETURN n, coalesce(c.id, '') AS clusterId, coalesce(c.name, '') AS clusterName
  `,

  /**
   * @description 특정 cluster에 BELONGS_TO로 연결된 활성 MacroNode 목록을 조회합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 조회할 cluster id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   clusterId: '...',
   * // }
   */
  listNodesByCluster: `
    MATCH (c:MacroCluster {userId: $userId, id: $clusterId})
    WHERE $includeDeleted OR c.deletedAt IS NULL
    MATCH (n:MacroNode {userId: $userId})-[:BELONGS_TO]->(c)
    WHERE $includeDeleted OR n.deletedAt IS NULL
    RETURN n, c.id AS clusterId, c.name AS clusterName
  `,

  /**
   * @description 활성 MacroRelation 목록을 RELATES_SOURCE/RELATES_TARGET endpoint id와 함께 조회합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  listEdges: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_RELATION]->(rel:MacroRelation {userId: $userId})
    WHERE $includeDeleted OR rel.deletedAt IS NULL
    MATCH (rel)-[:RELATES_SOURCE]->(src:MacroNode)
    MATCH (rel)-[:RELATES_TARGET]->(tgt:MacroNode)
    RETURN rel, src.id AS sourceNodeId, tgt.id AS targetNodeId
  `,

  /**
   * @description id로 단일 MacroCluster를 BELONGS_TO count와 함께 조회합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 조회할 cluster id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * //   clusterId: '...',
   * // }
   */
  findCluster: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(c:MacroCluster {userId: $userId, id: $clusterId})
    WHERE $includeDeleted OR c.deletedAt IS NULL
    OPTIONAL MATCH (n:MacroNode {userId: $userId})-[:BELONGS_TO]->(c)
    WHERE $includeDeleted OR n.deletedAt IS NULL
    RETURN c, count(DISTINCT n) AS size
  `,

  /**
   * @description 사용자의 활성 MacroCluster 목록을 BELONGS_TO count와 함께 조회합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  listClusters: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(c:MacroCluster {userId: $userId})
    WHERE $includeDeleted OR c.deletedAt IS NULL
    OPTIONAL MATCH (n:MacroNode {userId: $userId})-[:BELONGS_TO]->(c)
    WHERE $includeDeleted OR n.deletedAt IS NULL
    RETURN c, count(DISTINCT n) AS size
  `,

  /**
   * @description 사용자의 활성 MacroSubcluster 목록을 관계 집계와 함께 조회합니다.
   *
   * clusterId는 HAS_SUBCLUSTER 역방향으로, nodeIds는 CONTAINS 집계로, density는 0.0으로 반환합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  listSubclusters: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_SUBCLUSTER]->(sc:MacroSubcluster {userId: $userId})
    WHERE $includeDeleted OR sc.deletedAt IS NULL
    OPTIONAL MATCH (cl:MacroCluster {userId: $userId})-[:HAS_SUBCLUSTER]->(sc)
    OPTIONAL MATCH (sc)-[:CONTAINS]->(n:MacroNode {userId: $userId})
    WHERE $includeDeleted OR n.deletedAt IS NULL
    OPTIONAL MATCH (sc)-[:REPRESENTS]->(rep:MacroNode {userId: $userId})
    RETURN sc,
           coalesce(cl.id, '')  AS clusterId,
           collect(DISTINCT n.id) AS nodeIds,
           rep.id                 AS representativeNodeId,
           count(DISTINCT n)      AS size,
           coalesce(sc.density, 0.0) AS density
  `,

  /**
   * @description MacroStats를 MacroNode/MacroRelation/MacroCluster count 집계와 함께 조회합니다.
   *
   * nodes, edges, clusters는 저장된 값이 아닌 실제 관계 count로 복원됩니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  getStats: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_STATS]->(st:MacroStats)
    OPTIONAL MATCH (g)-[:HAS_NODE]->(n:MacroNode {userId: $userId})
    WHERE $includeDeleted OR n.deletedAt IS NULL
    OPTIONAL MATCH (g)-[:HAS_RELATION]->(r:MacroRelation {userId: $userId})
    WHERE $includeDeleted OR r.deletedAt IS NULL
    OPTIONAL MATCH (g)-[:HAS_CLUSTER]->(c:MacroCluster {userId: $userId})
    WHERE $includeDeleted OR c.deletedAt IS NULL
    RETURN st, count(DISTINCT n) AS nodes, count(DISTINCT r) AS edges, count(DISTINCT c) AS clusters
  `,

  /**
   * @description MacroSummary 노드를 조회합니다. aggregate context는 별도 쿼리로 구합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  getGraphSummary: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_SUMMARY]->(sm:MacroSummary)
    WHERE $includeDeleted OR sm.deletedAt IS NULL
    RETURN sm
  `,

  /**
   * @description summary overview count 복원을 위한 MacroNode type 집계를 조회합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  getSummaryNodeCounts: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
    WHERE $includeDeleted OR n.deletedAt IS NULL
    RETURN count(DISTINCT n)                                                            AS totalSourceNodes,
           sum(CASE WHEN n.nodeType = 'conversation' THEN 1 ELSE 0 END)                AS totalConversations,
           sum(CASE WHEN n.nodeType = 'note'         THEN 1 ELSE 0 END)                AS totalNotes,
           sum(CASE WHEN n.nodeType = 'notion'       THEN 1 ELSE 0 END)                AS totalNotions
  `,

  /**
   * @description summary cluster size 복원을 위한 cluster별 node count를 조회합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: '...',
   * // }
   */
  getSummaryClusterSizes: `
    MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(cl:MacroCluster {userId: $userId})
    WHERE $includeDeleted OR cl.deletedAt IS NULL
    OPTIONAL MATCH (n:MacroNode {userId: $userId})-[:BELONGS_TO]->(cl)
    WHERE $includeDeleted OR n.deletedAt IS NULL
    RETURN cl.id AS clusterId, count(DISTINCT n) AS size
  `,

  /**
   * @description 노드들을 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param ids 삭제할 노드 id 배열
   * @param deletedAt 삭제 타임스탬프
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   ids: [1, 2],
   * //   deletedAt: 1713000000000
   * // }
   */
  softDeleteNodesByIds: `
    MATCH (n:MacroNode {userId: $userId})
    WHERE n.id IN $ids
    SET n.deletedAt = $deletedAt
    WITH collect(n.id) AS nodeIds
    MATCH (r:MacroRelation {userId: $userId})
    WHERE EXISTS {
      MATCH (r)-[:RELATES_SOURCE|RELATES_TARGET]->(endpoint:MacroNode {userId: $userId})
      WHERE endpoint.id IN nodeIds
    }
    SET r.deletedAt = $deletedAt
    WITH nodeIds
    MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE startNode(mr).id IN nodeIds OR endNode(mr).id IN nodeIds
    SET mr.deletedAt = $deletedAt
  `,

  /**
   * @description 노드들을 Hard Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param ids 삭제할 노드 id 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   ids: [1, 2]
   * // }
   */
  hardDeleteNodesByIds: `
    MATCH (n:MacroNode {userId: $userId})
    WHERE n.id IN $ids
    WITH collect(n) AS nodes, collect(n.id) AS nodeIds
    OPTIONAL MATCH (r:MacroRelation {userId: $userId})
    WHERE EXISTS {
      MATCH (r)-[:RELATES_SOURCE|RELATES_TARGET]->(endpoint:MacroNode {userId: $userId})
      WHERE endpoint.id IN nodeIds
    }
    WITH nodes, nodeIds, collect(r) AS relations
    OPTIONAL MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE startNode(mr).id IN nodeIds OR endNode(mr).id IN nodeIds
    DELETE mr
    WITH nodes, relations
    FOREACH (rel IN relations | DETACH DELETE rel)
    FOREACH (node IN nodes | DETACH DELETE node)
  `,

  /**
   * @description 삭제된 노드들을 복원합니다.
   *
   * @param userId 사용자 ID
   * @param ids 복원할 노드 id 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   ids: [1, 2]
   * // }
   */
  restoreNodesByIds: `
    MATCH (n:MacroNode {userId: $userId})
    WHERE n.id IN $ids
    SET n.deletedAt = null
    WITH collect(n.id) AS nodeIds
    MATCH (r:MacroRelation {userId: $userId})
    WHERE EXISTS {
      MATCH (r)-[:RELATES_SOURCE|RELATES_TARGET]->(endpoint:MacroNode {userId: $userId})
      WHERE endpoint.id IN nodeIds
    }
    SET r.deletedAt = null
    WITH nodeIds
    MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE startNode(mr).id IN nodeIds OR endNode(mr).id IN nodeIds
    SET mr.deletedAt = null
  `,

  /**
   * @description origId 목록으로 노드 id 목록을 조회합니다.
   *
   * @param userId 사용자 ID
   * @param origIds 원본 데이터 id 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   origIds: ['doc-1', 'doc-2']
   * // }
   */
  findNodeIdsByOrigIds: `
    MATCH (n:MacroNode {userId: $userId})
    WHERE n.origId IN $origIds
    RETURN collect(n.id) AS ids
  `,

  /**
   * @description Edge를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param edgeId 삭제할 Edge id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   edgeId: 'edge-1'
   * // }
   */
  deleteEdgeById: `
    MATCH (r:MacroRelation {userId: $userId, id: $edgeId})
    OPTIONAL MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId, id: $edgeId}]->(:MacroNode {userId: $userId})
    DETACH DELETE r
    DELETE mr
  `,

  /**
   * @description Edge들을 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param edgeIds 삭제할 Edge id 배열
   * @param deletedAt 삭제 타임스탬프
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   edgeIds: ['edge-1', 'edge-2'],
   * //   deletedAt: 1713000000000
   * // }
   */
  softDeleteEdgesByIds: `
    MATCH (r:MacroRelation {userId: $userId})
    WHERE r.id IN $edgeIds
    SET r.deletedAt = $deletedAt
    WITH collect(r.id) AS edgeIds
    MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE mr.id IN edgeIds
    SET mr.deletedAt = $deletedAt
  `,

  /**
   * @description Edge들을 Hard Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param edgeIds 삭제할 Edge id 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   edgeIds: ['edge-1', 'edge-2']
   * // }
   */
  hardDeleteEdgesByIds: `
    MATCH (r:MacroRelation {userId: $userId})
    WHERE r.id IN $edgeIds
    WITH collect(r) AS relations, collect(r.id) AS edgeIds
    OPTIONAL MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE mr.id IN edgeIds
    DELETE mr
    WITH relations
    FOREACH (rel IN relations | DETACH DELETE rel)
  `,

  /**
   * @description 두 노드 사이의 Edge id 목록을 조회합니다.
   *
   * @param userId 사용자 ID
   * @param source 시작 노드 id
   * @param target 종료 노드 id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   source: 1,
   * //   target: 2
   * // }
   */
  findEdgeIdsBetween: `
    MATCH (r:MacroRelation {userId: $userId})-[:RELATES_SOURCE]->(src:MacroNode {userId: $userId})
    MATCH (r)-[:RELATES_TARGET]->(tgt:MacroNode {userId: $userId})
    WHERE (src.id = $source AND tgt.id = $target) OR (src.id = $target AND tgt.id = $source)
    RETURN collect(r.id) AS edgeIds
  `,

  /**
   * @description 특정 노드들에 연결된 Edge id 목록을 조회합니다.
   *
   * @param userId 사용자 ID
   * @param ids 연결된 노드 id 배열
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   ids: [1, 2]
   * // }
   */
  findEdgeIdsByNodeIds: `
    MATCH (r:MacroRelation {userId: $userId})-[:RELATES_SOURCE|RELATES_TARGET]->(endpoint:MacroNode {userId: $userId})
    WHERE endpoint.id IN $ids
    RETURN collect(DISTINCT r.id) AS edgeIds
  `,

  /**
   * @description 삭제된 Edge를 복원합니다.
   *
   * @param userId 사용자 ID
   * @param edgeId 복원할 Edge id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   edgeId: 'edge-1'
   * // }
   */
  restoreEdgeById: `
    MATCH (r:MacroRelation {userId: $userId, id: $edgeId})
    SET r.deletedAt = null
    WITH r
    MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId, id: $edgeId}]->(:MacroNode {userId: $userId})
    SET mr.deletedAt = null
  `,

  /**
   * @description Cluster를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 삭제할 Cluster id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   clusterId: 'cluster-1'
   * // }
   */
  deleteClusterById: `
    MATCH (c:MacroCluster {userId: $userId, id: $clusterId})
    DETACH DELETE c
  `,

  /**
   * @description Cluster를 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId Soft Delete할 Cluster id
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteClusterById: `
    MATCH (c:MacroCluster {userId: $userId, id: $clusterId})
    SET c.deletedAt = $deletedAt
  `,

  /**
   * @description 삭제된 Cluster를 복원합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 복원할 Cluster id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   clusterId: 'cluster-1'
   * // }
   */
  restoreClusterById: `
    MATCH (c:MacroCluster {userId: $userId, id: $clusterId})
    SET c.deletedAt = null
  `,

  /**
   * @description Subcluster를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 삭제할 Subcluster id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   subclusterId: 'subcluster-1'
   * // }
   */
  deleteSubclusterById: `
    MATCH (sc:MacroSubcluster {userId: $userId, id: $subclusterId})
    DETACH DELETE sc
  `,

  /**
   * @description Subcluster를 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId Soft Delete할 Subcluster id
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteSubclusterById: `
    MATCH (sc:MacroSubcluster {userId: $userId, id: $subclusterId})
    SET sc.deletedAt = $deletedAt
  `,

  /**
   * @description 삭제된 Subcluster를 복원합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 복원할 Subcluster id
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123',
   * //   subclusterId: 'subcluster-1'
   * // }
   */
  restoreSubclusterById: `
    MATCH (sc:MacroSubcluster {userId: $userId, id: $subclusterId})
    SET sc.deletedAt = null
  `,

  /**
   * @description Stats를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123'
   * // }
   */
  deleteStats: `
    MATCH (:MacroGraph {userId: $userId})-[:HAS_STATS]->(st:MacroStats)
    DETACH DELETE st
  `,

  /**
   * @description 사용자의 Macro Graph 전체를 삭제합니다. MacroGraph 루트 포함 모든 연결 노드를 제거합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123'
   * // }
   */
  deleteGraph: `
    MATCH (g:MacroGraph {userId: $userId})
    OPTIONAL MATCH (g)-[:HAS_NODE]->(n:MacroNode)
    OPTIONAL MATCH (g)-[:HAS_CLUSTER]->(cl:MacroCluster)
    OPTIONAL MATCH (g)-[:HAS_SUBCLUSTER]->(sc:MacroSubcluster)
    OPTIONAL MATCH (g)-[:HAS_RELATION]->(rel:MacroRelation)
    OPTIONAL MATCH (g)-[:HAS_STATS]->(st:MacroStats)
    OPTIONAL MATCH (g)-[:HAS_SUMMARY]->(sm:MacroSummary)
    DETACH DELETE g, n, cl, sc, rel, st, sm
  `,

  /**
   * @description 사용자의 MacroSummary만 삭제합니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123'
   * // }
   */
  deleteGraphSummary: `
    MATCH (:MacroGraph {userId: $userId})-[:HAS_SUMMARY]->(sm:MacroSummary)
    DETACH DELETE sm
  `,

  /**
   * @description upsertGraph 전처리: MacroGraph 루트는 유지하고 연결된 모든 노드를 삭제합니다.
   *
   * 이 쿼리는 upsertGraph 내 단일 write transaction 안에서 실행됩니다.
   *
   * @param userId 사용자 ID
   * @example
   * // 파라미터 구조 예시:
   * // {
   * //   userId: 'user-123'
   * // }
   */
  purgeUserData: `
    MATCH (g:MacroGraph {userId: $userId})
    OPTIONAL MATCH (g)-[:HAS_NODE]->(n:MacroNode)
    OPTIONAL MATCH (g)-[:HAS_CLUSTER]->(cl:MacroCluster)
    OPTIONAL MATCH (g)-[:HAS_SUBCLUSTER]->(sc:MacroSubcluster)
    OPTIONAL MATCH (g)-[:HAS_RELATION]->(rel:MacroRelation)
    OPTIONAL MATCH (g)-[:HAS_STATS]->(st:MacroStats)
    OPTIONAL MATCH (g)-[:HAS_SUMMARY]->(sm:MacroSummary)
    DETACH DELETE n, cl, sc, rel, st, sm
  `,

  /**
   * @description MacroNode의 특정 속성을 부분 업데이트합니다. (Incremental Update)
   *
   * `$props` 맵에 포함된 속성만 업데이트하며, 포함되지 않은 속성은 유지됩니다.
   * null 값을 전달하면 해당 속성이 제거됩니다 (deletedAt 복원 시 활용).
   *
   * @param userId 사용자 ID
   * @param id 업데이트할 node id
   * @param props 업데이트할 속성 맵 (undefined 키 제외, null 키 포함)
   */
  updateNode: `
    MATCH (n:MacroNode {userId: $userId, id: $id})
    SET n += $props
  `,

  /**
   * @description 기존 MacroNode들을 대상으로 소속 cluster와의 BELONGS_TO 관계를 복원합니다.
   *
   * 개별 cluster upsert 이후 이미 저장된 node들의 관계를 repair 합니다.
   * MacroNode에는 clusterId를 저장하지 않으므로 이 query는 관계를 생성하지 않는 호환용 no-op입니다.
   *
   * @param userId 사용자 ID
   * @param clusterIds 복원 대상 cluster id 배열
   */
  linkExistingNodesToClusters: `
    UNWIND $clusterIds AS cid
    MATCH (c:MacroCluster {userId: $userId, id: cid})
    RETURN count(c) AS inspectedClusters
  `,

  /**
   * @description 모든 active MacroNode를 Soft Delete 처리합니다. (deleteAllGraphData soft 경로)
   *
   * @param userId 사용자 ID
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteAllNodes: `
    MATCH (n:MacroNode {userId: $userId})
    WHERE n.deletedAt IS NULL
    SET n.deletedAt = $deletedAt
  `,

  /**
   * @description 모든 active MacroRelation 및 materialized MACRO_RELATED를 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteAllEdges: `
    MATCH (r:MacroRelation {userId: $userId})
    WHERE r.deletedAt IS NULL
    SET r.deletedAt = $deletedAt
    WITH collect(r.id) AS edgeIds
    MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE mr.id IN edgeIds AND mr.deletedAt IS NULL
    SET mr.deletedAt = $deletedAt
  `,

  /**
   * @description 모든 active MacroCluster를 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteAllClusters: `
    MATCH (c:MacroCluster {userId: $userId})
    WHERE c.deletedAt IS NULL
    SET c.deletedAt = $deletedAt
  `,

  /**
   * @description 모든 active MacroSubcluster를 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteAllSubclusters: `
    MATCH (sc:MacroSubcluster {userId: $userId})
    WHERE sc.deletedAt IS NULL
    SET sc.deletedAt = $deletedAt
  `,

  /**
   * @description active MacroSummary를 Soft Delete 처리합니다.
   *
   * @param userId 사용자 ID
   * @param deletedAt 삭제 타임스탬프 (number)
   */
  softDeleteSummaryNode: `
    MATCH (sm:MacroSummary {userId: $userId})
    WHERE sm.deletedAt IS NULL
    SET sm.deletedAt = $deletedAt
  `,

  /**
   * @description 모든 soft delete된 MacroNode와 연관된 MacroRelation/MACRO_RELATED를 복원합니다.
   *
   * @param userId 사용자 ID
   */
  restoreAllNodes: `
    MATCH (n:MacroNode {userId: $userId})
    WHERE n.deletedAt IS NOT NULL
    SET n.deletedAt = null
  `,

  /**
   * @description 모든 soft delete된 MacroRelation 및 materialized MACRO_RELATED를 복원합니다.
   *
   * @param userId 사용자 ID
   */
  restoreAllEdges: `
    MATCH (r:MacroRelation {userId: $userId})
    WHERE r.deletedAt IS NOT NULL
    SET r.deletedAt = null
    WITH collect(r.id) AS edgeIds
    MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
    WHERE mr.id IN edgeIds
    SET mr.deletedAt = null
  `,

  /**
   * @description 모든 soft delete된 MacroCluster를 복원합니다.
   *
   * @param userId 사용자 ID
   */
  restoreAllClusters: `
    MATCH (c:MacroCluster {userId: $userId})
    WHERE c.deletedAt IS NOT NULL
    SET c.deletedAt = null
  `,

  /**
   * @description 모든 soft delete된 MacroSubcluster를 복원합니다.
   *
   * @param userId 사용자 ID
   */
  restoreAllSubclusters: `
    MATCH (sc:MacroSubcluster {userId: $userId})
    WHERE sc.deletedAt IS NOT NULL
    SET sc.deletedAt = null
  `,

  /**
   * @description soft delete된 MacroSummary를 복원합니다.
   *
   * @param userId 사용자 ID
   */
  restoreGraphSummaryNode: `
    MATCH (sm:MacroSummary {userId: $userId})
    WHERE sm.deletedAt IS NOT NULL
    SET sm.deletedAt = null
  `,

  /**
   * @description Graph RAG용 1홉 이웃 탐색 쿼리입니다.
   *
   * Seed origId 목록으로 MacroNode를 찾고, MACRO_RELATED 관계로 직접 연결된(1홉) 이웃을 탐색합니다.
   * - Seed 자신은 결과에서 제외합니다 (NOT neighbor.origId IN $seedOrigIds).
   * - soft-deleted 노드 및 엣지는 필터링합니다.
   * - 여러 Seed와 공유 연결된 이웃은 connectionCount가 높아집니다.
   * - avgEdgeWeight: 해당 이웃으로 향하는 엣지들의 평균 weight입니다.
   *
   * @param userId 사용자 ID
   * @param seedOrigIds Seed 노드 origId 배열
   * @param limit 반환할 최대 이웃 수
   */
  graphRagNeighbors1Hop: `
    UNWIND $seedOrigIds AS seedOrigId
    MATCH (seed:MacroNode {userId: $userId, origId: seedOrigId})
    WHERE seed.deletedAt IS NULL
    MATCH (seed)-[r:MACRO_RELATED {userId: $userId}]-(neighbor:MacroNode {userId: $userId})
    WHERE neighbor.deletedAt IS NULL
      AND r.deletedAt IS NULL
      AND NOT neighbor.origId IN $seedOrigIds
    WITH neighbor, seed, r
    WITH neighbor.origId   AS origId,
         neighbor.id       AS nodeId,
         neighbor.nodeType AS nodeType,
         1                 AS hopDistance,
         collect(DISTINCT seed.origId)      AS connectedSeeds,
         avg(coalesce(r.weight, 0.5))       AS avgEdgeWeight,
         count(DISTINCT seed)               AS connectionCount
    RETURN origId, nodeId, nodeType, hopDistance, connectedSeeds, avgEdgeWeight, connectionCount
    ORDER BY connectionCount DESC, avgEdgeWeight DESC
    LIMIT $limit
  `,

  /**
   * @description Graph RAG용 2홉 이웃 탐색 쿼리입니다.
   *
   * Seed → 중간노드 → 이웃 경로(2홉)를 탐색합니다.
   * - Seed 자신 및 중간 노드(mid)는 결과에서 제외합니다.
   * - soft-deleted 노드 및 엣지는 모두 필터링합니다.
   * - avgEdgeWeight: 두 엣지(r1, r2)의 weight 평균입니다.
   *
   * @param userId 사용자 ID
   * @param seedOrigIds Seed 노드 origId 배열
   * @param limit 반환할 최대 이웃 수
   */
  graphRagNeighbors2Hop: `
    UNWIND $seedOrigIds AS seedOrigId
    MATCH (seed:MacroNode {userId: $userId, origId: seedOrigId})
    WHERE seed.deletedAt IS NULL
    MATCH (seed)-[r1:MACRO_RELATED {userId: $userId}]-(mid:MacroNode {userId: $userId})-[r2:MACRO_RELATED {userId: $userId}]-(neighbor:MacroNode {userId: $userId})
    WHERE mid.deletedAt IS NULL
      AND r1.deletedAt IS NULL
      AND r2.deletedAt IS NULL
      AND neighbor.deletedAt IS NULL
      AND NOT neighbor.origId IN $seedOrigIds
      AND NOT mid.origId IN $seedOrigIds
      AND neighbor.id <> mid.id
    WITH neighbor, seed, r1, r2
    WITH neighbor.origId   AS origId,
         neighbor.id       AS nodeId,
         neighbor.nodeType AS nodeType,
         2                 AS hopDistance,
         collect(DISTINCT seed.origId)                                            AS connectedSeeds,
         avg((coalesce(r1.weight, 0.5) + coalesce(r2.weight, 0.5)) / 2.0)       AS avgEdgeWeight,
         count(DISTINCT seed)                                                     AS connectionCount
    RETURN origId, nodeId, nodeType, hopDistance, connectedSeeds, avgEdgeWeight, connectionCount
    ORDER BY connectionCount DESC, avgEdgeWeight DESC
    LIMIT $limit
  `,
} as const;
