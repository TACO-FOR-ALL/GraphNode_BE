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
    ] as const;

    for (const key of requiredKeys) {
      it(`${key} 쿼리가 존재한다`, () => {
        expect(MACRO_GRAPH_CYPHER).toHaveProperty(key);
        expect(typeof MACRO_GRAPH_CYPHER[key]).toBe('string');
        expect((MACRO_GRAPH_CYPHER[key] as string).trim().length).toBeGreaterThan(0);
      });
    }
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
  });
});
