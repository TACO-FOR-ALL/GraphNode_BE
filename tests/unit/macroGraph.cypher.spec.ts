import {
  MACRO_GRAPH_SCHEMA_CYPHER,
  MACRO_GRAPH_CYPHER,
} from '../../src/infra/graph/cypher/macroGraph.cypher';

describe('macroGraph.cypher', () => {
  it('MACRO_GRAPH_SCHEMA_CYPHER가 export 된다', () => {
    expect(MACRO_GRAPH_SCHEMA_CYPHER).toBeDefined();
    expect(Array.isArray(MACRO_GRAPH_SCHEMA_CYPHER)).toBe(true);
    expect(MACRO_GRAPH_SCHEMA_CYPHER.length).toBeGreaterThan(0);
  });

  it('MACRO_GRAPH_CYPHER가 export 된다', () => {
    expect(MACRO_GRAPH_CYPHER).toBeDefined();
    expect(typeof MACRO_GRAPH_CYPHER).toBe('object');
  });

  describe('MACRO_GRAPH_CYPHER 필수 쿼리 존재 여부', () => {
    const requiredKeys = [
      'upsertGraphRoot',
      'upsertNodes',
      'upsertClusters',
      'upsertSubclusters',
      'clearSubclusterRelationshipsForReplacement',
      'upsertRelations',
      'upsertStats',
      'upsertSummary',
      'linkNodesToGraph',
      'linkClustersToGraph',
      'linkSubclustersToGraph',
      'linkRelationsToGraph',
      'linkStatsToGraph',
      'linkSummaryToGraph',
      'linkNodeBelongsToCluster',
      'linkSubclusterToCluster',
      'linkSubclusterContainsNodes',
      'linkSubclusterRepresentsNode',
      'linkRelationEndpoints',
      'linkMaterializedMacroRelated',
      'listNodes',
      'findNode',
      'findNodesByOrigIds',
      'listNodesByCluster',
      'listEdges',
      'findCluster',
      'listClusters',
      'listSubclusters',
      'getStats',
      'getGraphSummary',
      'deleteGraph',
      'deleteGraphSummary',
      'softDeleteNodesByOrigIds',
      'hardDeleteNodesByOrigIds',
      'restoreNodesByOrigIds',
      'getMaxNodeId',
      'findEdgeById',
      'findSubclusterById',
      'updateEdge',
      'updateCluster',
      'updateSubcluster',
      'moveNodeToCluster',
      'moveSubclusterToCluster',
      'addNodeToSubcluster',
      'removeNodeFromSubcluster',
      'clusterHasNodes',
      'pruneIncompatibleSubclusterMemberships',
      'reconcileSubclusterMemberships',
      'getSummaryNodeCounts',
      'cloneMacroGraphRoot',
      'cloneMacroGraphNodes',
      'cloneMacroGraphClusters',
      'cloneMacroGraphRelations',
      'cloneMacroGraphSubclusters',
    ] as const;

    for (const key of requiredKeys) {
      it(`${key} 쿼리가 존재한다`, () => {
        expect(MACRO_GRAPH_CYPHER).toHaveProperty(key);
        expect(typeof MACRO_GRAPH_CYPHER[key]).toBe('string');
        expect((MACRO_GRAPH_CYPHER[key] as string).trim().length).toBeGreaterThan(0);
      });
    }
  });

  describe('macroId 스코핑 검증 (1:N 전환)', () => {
    it('MACRO_GRAPH_SCHEMA_CYPHER에 기존 unique 제약 삭제 구문이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/DROP CONSTRAINT macro_graph_user_unique/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 (userId, macroId) 복합 unique 제약 생성 구문이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/REQUIRE \(g\.userId, g\.macroId\) IS UNIQUE/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 기존 MacroGraph 노드 마이그레이션 구문이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/SET g\.macroId = g\.userId/);
    });

    it('upsertGraphRoot: MacroGraph를 {userId, macroId} 복합키로 MERGE한다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertGraphRoot;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('linkNodesToGraph: MacroGraph를 {userId, macroId}로 조회한다', () => {
      const q = MACRO_GRAPH_CYPHER.linkNodesToGraph;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('deleteStats: MacroGraph를 {userId, macroId}로 조회한다', () => {
      const q = MACRO_GRAPH_CYPHER.deleteStats;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('deleteGraphSummary: MacroGraph를 {userId, macroId}로 조회한다', () => {
      const q = MACRO_GRAPH_CYPHER.deleteGraphSummary;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('deleteGraphBatch.graphRoot: MacroGraph를 {userId, macroId}로 조회한다', () => {
      const q = MACRO_GRAPH_CYPHER.deleteGraphBatch.graphRoot;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('cloneMacroGraph 쿼리가 존재한다 (5개 분리 상수)', () => {
      expect(MACRO_GRAPH_CYPHER).toHaveProperty('cloneMacroGraphRoot');
      expect(MACRO_GRAPH_CYPHER).toHaveProperty('cloneMacroGraphNodes');
      expect(MACRO_GRAPH_CYPHER).toHaveProperty('cloneMacroGraphClusters');
      expect(MACRO_GRAPH_CYPHER).toHaveProperty('cloneMacroGraphRelations');
      expect(MACRO_GRAPH_CYPHER).toHaveProperty('cloneMacroGraphSubclusters');
      expect(MACRO_GRAPH_CYPHER.cloneMacroGraphRoot.trim().length).toBeGreaterThan(0);
    });

    it('cloneMacroGraph: src/dst MacroGraph를 {userId, macroId}로 구분한다', () => {
      const qRoot = MACRO_GRAPH_CYPHER.cloneMacroGraphRoot;
      expect(qRoot).toMatch(/MacroGraph \{userId: \$userId, macroId: \$sourceMacroId\}/);
      expect(qRoot).toMatch(/MacroGraph \{userId: \$userId, macroId: \$newMacroId\}/);
    });

    it('cloneMacroGraph: executeWrite 내부에서 일반 CALL {} 서브쿼리를 사용한다', () => {
      const qNodes = MACRO_GRAPH_CYPHER.cloneMacroGraphNodes;
      expect(qNodes).toContain('CALL {');
      expect(qNodes).not.toMatch(/IN TRANSACTIONS OF \d+ ROWS/);
    });

    it('MacroGraph {userId: $userId}만 단독으로 쓰는 쿼리가 없다 (listMacroViews 제외)', () => {
      const allCyphers = [
        ...Object.entries(MACRO_GRAPH_CYPHER)
          .filter(([key]) => key !== 'listMacroViews')
          .flatMap(([, v]) =>
            typeof v === 'string' ? [v] : Object.values(v as Record<string, string>)
          ),
      ].join('\n');
      // {userId: $userId}만 있고 macroId가 없는 MacroGraph 매칭 패턴은 없어야 한다
      const matches = allCyphers.match(/MacroGraph\s*\{userId:\s*\$userId\s*\}/g);
      expect(matches ?? []).toHaveLength(0);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 MacroNode (userId, macroId, id) 복합 unique 제약이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/FOR \(n:MacroNode\) REQUIRE \(n\.userId, n\.macroId, n\.id\) IS UNIQUE/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 MacroCluster (userId, macroId, id) 복합 unique 제약이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/FOR \(c:MacroCluster\) REQUIRE \(c\.userId, c\.macroId, c\.id\) IS UNIQUE/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 MacroSubcluster (userId, macroId, id) 복합 unique 제약이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/FOR \(sc:MacroSubcluster\) REQUIRE \(sc\.userId, sc\.macroId, sc\.id\) IS UNIQUE/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 MacroRelation (userId, macroId, id) 복합 unique 제약이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/FOR \(r:MacroRelation\) REQUIRE \(r\.userId, r\.macroId, r\.id\) IS UNIQUE/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 MacroStats (userId, macroId) 복합 unique 제약이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/FOR \(st:MacroStats\) REQUIRE \(st\.userId, st\.macroId\) IS UNIQUE/);
    });

    it('MACRO_GRAPH_SCHEMA_CYPHER에 MacroSummary (userId, macroId) 복합 unique 제약이 있다', () => {
      const joined = MACRO_GRAPH_SCHEMA_CYPHER.join('\n');
      expect(joined).toMatch(/FOR \(sm:MacroSummary\) REQUIRE \(sm\.userId, sm\.macroId\) IS UNIQUE/);
    });

    it('upsertNodes: macroId를 MERGE 키에 포함한다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertNodes;
      expect(q).toMatch(/MERGE \(n:MacroNode \{userId: row\.userId, macroId: row\.macroId, id: row\.id\}\)/);
    });

    it('upsertStats: macroId를 MERGE 키에 포함한다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertStats;
      expect(q).toMatch(/MERGE \(st:MacroStats \{userId: \$userId, macroId: \$macroId\}\)/);
    });

    it('softDeleteNodesByIds: macroId로 선택한 MacroGraph의 노드만 삭제한다', () => {
      const q = MACRO_GRAPH_CYPHER.softDeleteNodesByIds;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
      expect(q).toMatch(/MacroNode \{userId: \$userId, macroId: \$macroId\}/);
      expect(q).toMatch(/MacroRelation \{userId: \$userId, macroId: \$macroId\}/);
      expect(q).toMatch(/MACRO_RELATED \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('hardDeleteNodesByIds: macroId로 선택한 MacroGraph의 노드만 삭제한다', () => {
      const q = MACRO_GRAPH_CYPHER.hardDeleteNodesByIds;
      expect(q).toMatch(/MacroGraph \{userId: \$userId, macroId: \$macroId\}/);
      expect(q).toMatch(/MacroNode \{userId: \$userId, macroId: \$macroId\}/);
      expect(q).toMatch(/MacroRelation \{userId: \$userId, macroId: \$macroId\}/);
      expect(q).toMatch(/MACRO_RELATED \{userId: \$userId, macroId: \$macroId\}/);
    });

    it('upsertSummary: macroId를 MERGE 키에 포함한다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertSummary;
      expect(q).toMatch(/MERGE \(sm:MacroSummary \{userId: \$userId, macroId: \$macroId\}\)/);
    });

    it('delete/restore by origId targets matched node entities instead of numeric ids', () => {
      const queries = [
        MACRO_GRAPH_CYPHER.hardDeleteNodesByOrigIds,
        MACRO_GRAPH_CYPHER.restoreNodesByOrigIds,
      ];

      for (const q of queries) {
        expect(q).toMatch(/MATCH \(n:MacroNode \{userId: \$userId\}\)/);
        expect(q).toMatch(/WHERE n\.origId IN \$origIds/);
        expect(q).toMatch(/WITH collect\(n\) AS nodes/);
        expect(q).toMatch(/endpoint IN nodes/);
        expect(q).toMatch(/source IN nodes OR target IN nodes/);
        expect(q).not.toMatch(/collect\(n\.id\) AS nodeIds/);
        expect(q).not.toMatch(/endpoint\.id IN nodeIds/);
      }
    });

    it('softDeleteNodesByOrigIds soft-deletes matched nodes and connected edges across active and soft-deleted macro views', () => {
      const q = MACRO_GRAPH_CYPHER.softDeleteNodesByOrigIds;

      expect(q).toMatch(/MATCH \(n:MacroNode \{userId: \$userId\}\)/);
      expect(q).toMatch(/WHERE n\.origId IN \$origIds/);
      expect(q).toMatch(/SET n\.deletedAt = \$deletedAt/);
      expect(q).toMatch(/WITH collect\(DISTINCT n\) AS nodes/);
      expect(q).toMatch(/MATCH \(r:MacroRelation \{userId: \$userId\}\)/);
      expect(q).toMatch(/endpoint IN nodes/);
      expect(q).toMatch(/SET r\.deletedAt = \$deletedAt/);
      expect(q).toMatch(/MATCH \(source:MacroNode \{userId: \$userId\}\)-\[mr:MACRO_RELATED \{userId: \$userId\}\]->\(target:MacroNode \{userId: \$userId\}\)/);
      expect(q).toMatch(/source IN nodes OR target IN nodes/);
      expect(q).toMatch(/SET mr\.deletedAt = \$deletedAt/);
      expect(q).not.toMatch(/g\.deletedAt IS NULL/);
      expect(q).not.toMatch(/HAS_NODE/);
      expect(q).not.toMatch(/macroId: \$macroId/);
      expect(q).not.toMatch(/n\.id IN \$ids/);
      expect(q).not.toMatch(/collect\(n\.id\)/);
    });

    it('cloneMacroGraph: 하위 엔티티를 newMacroId로 독립 복제한다', () => {
      expect(MACRO_GRAPH_CYPHER.cloneMacroGraphNodes).toMatch(
        /MERGE \(newNode:MacroNode \{userId: \$userId, macroId: \$newMacroId, id: n\.id\}\)/
      );
      expect(MACRO_GRAPH_CYPHER.cloneMacroGraphClusters).toMatch(
        /MERGE \(newCluster:MacroCluster \{userId: \$userId, macroId: \$newMacroId, id: c\.id\}\)/
      );
    });
  });

  describe('Cypher 원칙 검증 (금지 패턴 없음)', () => {
    const allCyphers = Object.values(MACRO_GRAPH_CYPHER).join('\n');

    it('snapshot/version/hash 관련 식별자가 없다', () => {
      expect(allCyphers).not.toMatch(/snapshot|Snapshot|SNAPSHOT/);
      expect(allCyphers).not.toMatch(/version|Version|VERSION/);
      expect(allCyphers).not.toMatch(/hash|Hash|HASH/);
    });

    it('ACTIVE_SNAPSHOT/STAGED/ARCHIVED 상태값이 없다', () => {
      expect(allCyphers).not.toMatch(/ACTIVE_SNAPSHOT|STAGED|ARCHIVED/);
    });

    it('upsertNodes: MacroNode에 clusterId/clusterName 속성을 저장하지 않는다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertNodes;
      expect(q).not.toMatch(/clusterId/);
      expect(q).not.toMatch(/clusterName/);
    });

    it('upsertClusters: MacroCluster에 size 속성을 저장하지 않는다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertClusters;
      expect(q).not.toMatch(/\.size\s*=/);
    });

    it('upsertSubclusters: MacroSubcluster에 clusterId/nodeIds/representativeNodeId/size/density 속성을 저장하지 않는다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertSubclusters;
      expect(q).not.toMatch(/clusterId/);
      expect(q).not.toMatch(/nodeIds/);
      expect(q).not.toMatch(/representativeNodeId/);
      expect(q).not.toMatch(/\.size\s*=/);
    });

    it('upsertRelations: MacroRelation에 source/target 속성을 저장하지 않는다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertRelations;
      expect(q).not.toMatch(/\.source\s*=/);
      expect(q).not.toMatch(/\.target\s*=/);
    });

    it('getSummaryNodeCounts: totalFiles 컬럼을 포함한다', () => {
      const q = MACRO_GRAPH_CYPHER.getSummaryNodeCounts;
      expect(q).toMatch(/totalFiles/);
      expect(q).toMatch(/nodeType\s*=\s*'file'/);
    });

    it('getStats: nodes/edges/clusters를 property가 아닌 count 집계로 조회한다', () => {
      const q = MACRO_GRAPH_CYPHER.getStats;
      expect(q).toMatch(/count\(DISTINCT/);
      expect(q).toMatch(/AS nodes/);
      expect(q).toMatch(/AS edges/);
      expect(q).toMatch(/AS clusters/);
    });

    it('upsertNodes: UNWIND $rows 기반 batch 쿼리이다', () => {
      expect(MACRO_GRAPH_CYPHER.upsertNodes).toMatch(/UNWIND \$rows AS row/);
    });

    it('linkNodeBelongsToCluster: BELONGS_TO 관계를 사용한다', () => {
      expect(MACRO_GRAPH_CYPHER.linkNodeBelongsToCluster).toMatch(/BELONGS_TO/);
    });

    it('linkRelationEndpoints: RELATES_SOURCE와 RELATES_TARGET 관계를 사용한다', () => {
      const q = MACRO_GRAPH_CYPHER.linkRelationEndpoints;
      expect(q).toMatch(/RELATES_SOURCE/);
      expect(q).toMatch(/RELATES_TARGET/);
    });

    it('linkMaterializedMacroRelated: MACRO_RELATED 관계를 사용한다', () => {
      expect(MACRO_GRAPH_CYPHER.linkMaterializedMacroRelated).toMatch(/MACRO_RELATED/);
    });

    it('upsertRelations: 사용자 정의 relationType/relation/propertiesJson을 저장한다', () => {
      const q = MACRO_GRAPH_CYPHER.upsertRelations;
      expect(q).toMatch(/r\.relationType\s*=\s*row\.relationType/);
      expect(q).toMatch(/r\.relation\s*=\s*row\.relation/);
      expect(q).toMatch(/r\.propertiesJson\s*=\s*row\.propertiesJson/);
    });

    it('linkMaterializedMacroRelated: materialized edge에도 사용자 정의 관계 속성을 복제한다', () => {
      const q = MACRO_GRAPH_CYPHER.linkMaterializedMacroRelated;
      expect(q).toMatch(/r\.relationType\s*=\s*row\.relationType/);
      expect(q).toMatch(/r\.relation\s*=\s*row\.relation/);
      expect(q).toMatch(/r\.propertiesJson\s*=\s*row\.propertiesJson/);
    });

    it('updateEdge: MacroRelation과 MACRO_RELATED 관계를 같은 값으로 동기화한다', () => {
      const q = MACRO_GRAPH_CYPHER.updateEdge;
      expect(q).toMatch(/SET rel \+= \$props/);
      expect(q).toMatch(/mr\.weight\s*=\s*rel\.weight/);
      expect(q).toMatch(/mr\.relationType\s*=\s*rel\.relationType/);
      expect(q).toMatch(/mr\.propertiesJson\s*=\s*rel\.propertiesJson/);
    });

    it('moveNodeToCluster: 기존 BELONGS_TO를 삭제한 뒤 새 cluster와 연결한다', () => {
      const q = MACRO_GRAPH_CYPHER.moveNodeToCluster;
      expect(q).toMatch(/DELETE oldRel/);
      expect(q).toMatch(/MERGE \(n\)-\[:BELONGS_TO\]->\(newCluster\)/);
    });

    it('moveSubclusterToCluster: subcluster와 포함 node의 cluster 소속을 함께 이동한다', () => {
      const q = MACRO_GRAPH_CYPHER.moveSubclusterToCluster;
      expect(q).toMatch(/MERGE \(newCluster\)-\[:HAS_SUBCLUSTER\]->\(sc\)/);
      expect(q).toMatch(/MERGE \(n\)-\[:BELONGS_TO\]->\(newCluster\)/);
    });

    it('pruneIncompatibleSubclusterMemberships: node cluster와 subcluster parent cluster가 다를 때 stale membership을 삭제한다', () => {
      const q = MACRO_GRAPH_CYPHER.pruneIncompatibleSubclusterMemberships;

      expect(q).toMatch(/HAS_NODE/);
      expect(q).toMatch(/BELONGS_TO/);
      expect(q).toMatch(/HAS_SUBCLUSTER/);
      expect(q).toMatch(/CONTAINS\|REPRESENTS/);
      expect(q).toMatch(/subclusterCluster\.id\s*<>\s*nodeCluster\.id/);
      expect(q).toMatch(/DELETE rel/);
      expect(q).toMatch(/containsDeleted/);
      expect(q).toMatch(/representsDeleted/);
    });

    it('reconcileSubclusterMemberships: invalid subcluster를 hard delete하고 대표를 최소 numeric node id로 재선정한다', () => {
      const q = MACRO_GRAPH_CYPHER.reconcileSubclusterMemberships;

      expect(q).toMatch(/DETACH DELETE subcluster/);
      expect(q).toMatch(/size\(validContainedNodes\)\s*=\s*0/);
      expect(q).toMatch(/parentActiveNodeCount\s*=\s*0/);
      expect(q).toMatch(/invalidRepresents/);
      expect(q).toMatch(/containsRel IS NULL/);
      expect(q).toMatch(/ORDER BY toInteger\(candidate\.id\) ASC/);
      expect(q).toMatch(/MERGE \(sc\)-\[:REPRESENTS\]->\(representativeCandidate\)/);
      expect(q).toMatch(/deletedSubclusters/);
      expect(q).toMatch(/removedInvalidRepresents/);
      expect(q).toMatch(/reassignedRepresentatives/);
    });

    it('clearSubclusterRelationshipsForReplacement: 전달된 subcluster id 범위의 HAS_SUBCLUSTER/CONTAINS/REPRESENTS를 삭제한다', () => {
      const q = MACRO_GRAPH_CYPHER.clearSubclusterRelationshipsForReplacement;

      expect(q).toMatch(/UNWIND \$subclusterIds AS subclusterId/);
      expect(q).toMatch(/MacroSubcluster \{userId: \$userId, macroId: \$macroId, id: subclusterId\}/);
      expect(q).toMatch(/HAS_SUBCLUSTER/);
      expect(q).toMatch(/CONTAINS/);
      expect(q).toMatch(/REPRESENTS/);
      expect(q).toMatch(/DELETE rel/);
    });

    it('linkSubclusterContainsNodes: node cluster와 subcluster parent cluster가 일치할 때만 CONTAINS를 생성한다', () => {
      const q = MACRO_GRAPH_CYPHER.linkSubclusterContainsNodes;

      expect(q).toMatch(/MacroCluster \{userId: \$userId\}\)-\[:HAS_SUBCLUSTER\]->\(sc\)/);
      expect(q).toMatch(/\(n\)-\[:BELONGS_TO\]->\(cl\)/);
      expect(q).toMatch(/MERGE \(sc\)-\[:CONTAINS\]->\(n\)/);
    });

    it('linkSubclusterRepresentsNode: node cluster와 subcluster parent cluster가 일치할 때만 REPRESENTS를 생성한다', () => {
      const q = MACRO_GRAPH_CYPHER.linkSubclusterRepresentsNode;

      expect(q).toMatch(/MacroCluster \{userId: \$userId\}\)-\[:HAS_SUBCLUSTER\]->\(sc\)/);
      expect(q).toMatch(/\(n\)-\[:BELONGS_TO\]->\(cl\)/);
      expect(q).toMatch(/MERGE \(sc\)-\[:REPRESENTS\]->\(n\)/);
    });
  });
});
