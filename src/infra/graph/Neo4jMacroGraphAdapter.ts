import type { Driver, ManagedTransaction } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

import { getNeo4jDriver } from '../db/neo4j';
import type {
  MacroGraphStore,
  MacroGraphStoreOptions,
  MacroGraphUpsertInput,
  MacroGraphUpsertResult,
} from '../../core/ports/MacroGraphStore';
import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../../core/types/persistence/graph.persistence';
import { MACRO_GRAPH_CYPHER } from './cypher/macroGraph.cypher';
import {
  fromNeo4jMacroCluster,
  fromNeo4jMacroNode,
  fromNeo4jMacroRelation,
  fromNeo4jMacroStats,
  fromNeo4jMacroSubcluster,
  fromNeo4jMacroSummary,
  toNeo4jMacroCluster,
  toNeo4jMacroNode,
  toNeo4jMacroRelation,
  toNeo4jMacroStats,
  toNeo4jMacroSubcluster,
  toNeo4jMacroSummary,
  type Neo4jMacroSummaryAggregateContext,
} from './mappers/macroGraphNeo4j.mapper';
import type { MacroFileType, Neo4jMacroSummaryNode } from '../../core/types/neo4j/macro.neo4j';
import { logger } from '../../shared/utils/logger';

/**
 * @description Neo4j Integer → JS number 변환 헬퍼입니다.
 *
 * Neo4j driver는 정수를 Integer 객체로 반환할 수 있습니다. toNumber()를 호출해 변환합니다.
 *
 * @param val Neo4j에서 반환된 값
 * @returns JS number. 변환 불가 시 0
 */
function toJsNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val !== null && val !== undefined && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber(): number }).toNumber();
  }
  return Number(val) || 0;
}

/**
 * @description Neo4j Integer 배열 → JS number 배열 변환 헬퍼입니다.
 *
 * @param arr Neo4j에서 반환된 배열 (Integer 또는 number 혼용 가능)
 * @returns JS number 배열
 */
function toJsNumberArray(arr: unknown[]): number[] {
  return arr.map(toJsNumber);
}

/**
 * @description Neo4j에서 반환된 노드 properties에서 Neo4jMacroNodeHydratedRow를 생성합니다.
 */
function buildNodeRow(record: { get(key: string): unknown }) {
  const props = (record.get('n') as { properties: Record<string, unknown> }).properties;
  return {
    node: {
      id: toJsNumber(props['id']),
      userId: String(props['userId'] ?? ''),
      origId: String(props['origId'] ?? ''),
      nodeType: props['nodeType'] as 'conversation' | 'note' | 'notion' | 'file',
      fileType: props['fileType'] as MacroFileType | undefined,
      mimeType: props['mimeType'] as string | undefined,
      timestamp: props['timestamp'] as string | null,
      numMessages: toJsNumber(props['numMessages']),
      embedding: Array.isArray(props['embedding']) ? (props['embedding'] as number[]) : undefined,
      createdAt: props['createdAt'] as string | undefined,
      updatedAt: props['updatedAt'] as string | undefined,
      deletedAt: props['deletedAt'] as number | null | undefined,
    },
    clusterId: String(record.get('clusterId') ?? ''),
    clusterName: String(record.get('clusterName') ?? ''),
  };
}

/**
 * @description Macro Graph 전체를 Neo4j에 저장하고 조회하는 adapter입니다.
 *
 * MacroGraphStore port를 구현하며, upsertGraph는 기존 userId 데이터를 정리한 뒤
 * 현재 payload 기준으로 재구성합니다. 조회 메서드는 MACRO_GRAPH_CYPHER와 mapper를 사용합니다.
 */
export class Neo4jMacroGraphAdapter implements MacroGraphStore {
  private getDriver(): Driver {
    return getNeo4jDriver();
  }

  /**
   * @description options.transaction이 있으면 해당 transaction을 사용하고, 없으면 session을 열어 닫습니다.
   */
  private async runRead<T>(
    fn: (runner: {
      run(query: string, params?: Record<string, unknown>): Promise<{ records: unknown[] }>;
    }) => Promise<T>,
    options?: MacroGraphStoreOptions
  ): Promise<T> {
    const tx = options?.transaction as ManagedTransaction | undefined;
    if (tx && typeof tx.run === 'function') {
      return fn(tx as unknown as Parameters<typeof fn>[0]);
    }
    const session = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
    try {
      return await fn(session as unknown as Parameters<typeof fn>[0]);
    } finally {
      await session.close();
    }
  }

  private async runWrite<T>(
    fn: (runner: ManagedTransaction) => Promise<T>,
    options?: MacroGraphStoreOptions
  ): Promise<T> {
    const tx = options?.transaction as ManagedTransaction | undefined;
    if (tx && typeof tx.run === 'function') {
      return fn(tx);
    }
    const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      return await session.executeWrite((innerTx) => fn(innerTx));
    } finally {
      await session.close();
    }
  }

  private readParams(userId: string, options?: MacroGraphStoreOptions): Record<string, unknown> {
    return { userId, includeDeleted: options?.includeDeleted ?? false };
  }

  /**
   * @description Macro Graph 전체를 Neo4j에 upsert 합니다.
   *
   * Phase 1 전략: 기존 userId 범위의 연결 노드를 정리한 뒤 현재 payload 기준으로 재구성합니다.
   * 이 작업은 단일 Neo4j write transaction 안에서 수행합니다.
   *
   * @param input 기존 graph persistence 문서 묶음
   * @param options transaction 등 adapter 전용 옵션
   * @returns 저장된 count 요약
   */
  async upsertGraph(
    input: MacroGraphUpsertInput,
    options?: MacroGraphStoreOptions
  ): Promise<MacroGraphUpsertResult> {
    const { userId, nodes, edges, clusters, subclusters, stats, summary } = input;
    const now = new Date().toISOString();

    const tx = options?.transaction as ManagedTransaction | undefined;

    const execute = async (runner: ManagedTransaction): Promise<void> => {
      // 1. 기존 데이터 정리 (MacroGraph 루트 유지, 연결된 노드/관계 삭제)
      await runner.run(MACRO_GRAPH_CYPHER.purgeUserData, { userId });

      // 2. MacroGraph 루트 upsert
      await runner.run(MACRO_GRAPH_CYPHER.upsertGraphRoot, { userId, now });

      // 3. 엔티티 upsert
      if (nodes.length > 0) {
        const nodeRows = nodes.map((doc) => toNeo4jMacroNode(doc));
        await runner.run(MACRO_GRAPH_CYPHER.upsertNodes, { rows: nodeRows });
      }

      if (clusters.length > 0) {
        const clusterRows = clusters.map(toNeo4jMacroCluster);
        await runner.run(MACRO_GRAPH_CYPHER.upsertClusters, { rows: clusterRows });
      }

      if (subclusters.length > 0) {
        const subclusterRows = subclusters.map(toNeo4jMacroSubcluster);
        await runner.run(MACRO_GRAPH_CYPHER.upsertSubclusters, { rows: subclusterRows });
      }

      if (edges.length > 0) {
        const relationRows = edges.map(toNeo4jMacroRelation);
        await runner.run(MACRO_GRAPH_CYPHER.upsertRelations, { rows: relationRows });
      }

      // stats upsert
      const statsNeo4j = toNeo4jMacroStats(stats);
      await runner.run(MACRO_GRAPH_CYPHER.upsertStats, {
        userId,
        id: statsNeo4j.id,
        status: statsNeo4j.status,
        generatedAt: statsNeo4j.generatedAt,
        updatedAt: statsNeo4j.updatedAt ?? null,
        metadataJson: statsNeo4j.metadataJson,
      });

      if (summary) {
        const summaryNeo4j = toNeo4jMacroSummary(summary);
        await runner.run(MACRO_GRAPH_CYPHER.upsertSummary, {
          userId,
          id: summaryNeo4j.id,
          overviewJson: summaryNeo4j.overviewJson,
          clustersJson: summaryNeo4j.clustersJson,
          patternsJson: summaryNeo4j.patternsJson,
          connectionsJson: summaryNeo4j.connectionsJson,
          recommendationsJson: summaryNeo4j.recommendationsJson,
          generatedAt: summaryNeo4j.generatedAt,
          detailLevel: summaryNeo4j.detailLevel,
          deletedAt: summaryNeo4j.deletedAt ?? null,
        });
      }

      // 4. MacroGraph 루트 ↔ 엔티티 관계 생성
      if (nodes.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkNodesToGraph, {
          userId,
          rows: nodes.map((n) => ({ id: n.id })),
        });
      }
      if (clusters.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkClustersToGraph, {
          userId,
          rows: clusters.map((c) => ({ id: c.id })),
        });
      }
      if (subclusters.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclustersToGraph, {
          userId,
          rows: subclusters.map((sc) => ({ id: sc.id })),
        });
      }
      if (edges.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkRelationsToGraph, {
          userId,
          rows: edges.map((e) => ({ id: e.id })),
        });
      }
      await runner.run(MACRO_GRAPH_CYPHER.linkStatsToGraph, { userId });
      if (summary) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSummaryToGraph, { userId });
      }

      // 5. 도메인 관계 생성
      // node → cluster (BELONGS_TO)
      const belongsToRows = nodes
        .filter((n) => n.clusterId)
        .map((n) => ({ nodeId: n.id, clusterId: n.clusterId }));
      if (belongsToRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkNodeBelongsToCluster, {
          userId,
          rows: belongsToRows,
        });
      }

      // cluster → subcluster (HAS_SUBCLUSTER)
      const subclusterToClusterRows = subclusters
        .filter((sc) => sc.clusterId)
        .map((sc) => ({ clusterId: sc.clusterId, subclusterId: sc.id }));
      if (subclusterToClusterRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclusterToCluster, {
          userId,
          rows: subclusterToClusterRows,
        });
      }

      // subcluster → nodes (CONTAINS)
      const containsRows: { subclusterId: string; nodeId: number }[] = [];
      for (const sc of subclusters) {
        for (const nid of sc.nodeIds) {
          containsRows.push({ subclusterId: sc.id, nodeId: nid });
        }
      }
      if (containsRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclusterContainsNodes, {
          userId,
          rows: containsRows,
        });
      }

      // subcluster → representative node (REPRESENTS)
      const representsRows = subclusters
        .filter((sc) => sc.representativeNodeId != null)
        .map((sc) => ({ subclusterId: sc.id, nodeId: sc.representativeNodeId }));
      if (representsRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclusterRepresentsNode, {
          userId,
          rows: representsRows,
        });
      }

      // relation → source/target (RELATES_SOURCE, RELATES_TARGET)
      const endpointRows = edges.map((e) => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
      }));
      if (endpointRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkRelationEndpoints, {
          userId,
          rows: endpointRows,
        });
      }

      // materialized MACRO_RELATED
      const macroRelatedRows = edges.map((e) => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        type: e.type,
        intraCluster: e.intraCluster,
        deletedAt: e.deletedAt ?? null,
      }));
      if (macroRelatedRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkMaterializedMacroRelated, {
          userId,
          rows: macroRelatedRows,
        });
      }
    };

    if (tx) {
      await execute(tx);
    } else {
      const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
      try {
        await session.executeWrite((innerTx) => execute(innerTx));
      } finally {
        await session.close();
      }
    }

    logger.info(
      { userId, nodes: nodes.length, edges: edges.length, clusters: clusters.length },
      'Neo4jMacroGraphAdapter.upsertGraph completed'
    );

    return {
      nodes: nodes.length,
      edges: edges.length,
      clusters: clusters.length,
      subclusters: subclusters.length,
      summary: summary != null,
    };
  }

  /**
   * @description MacroGraph 루트 노드를 보장합니다. (Incremental Write 전처리 헬퍼)
   *
   * @param userId 사용자 ID
   * @param runner 실행할 transaction runner
   */
  private async ensureGraphRoot(
    userId: string,
    runner: {
      run(query: string, params?: Record<string, unknown>): Promise<{ records: unknown[] }>;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    await runner.run(MACRO_GRAPH_CYPHER.upsertGraphRoot, { userId, now });
  }

  /**
   * @description 단일 graph node를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param node 저장할 graph node 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertNode(node: GraphNodeDoc, options?: MacroGraphStoreOptions): Promise<void> {
    await this.upsertNodes([node], options);
  }

  /**
   * @description 다수의 graph node를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * @param nodes 저장할 graph node 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertNodes(nodes: GraphNodeDoc[], options?: MacroGraphStoreOptions): Promise<void> {
    if (nodes.length === 0) return;
    const userId = nodes[0].userId;

    await this.runWrite(async (runner) => {
      await this.ensureGraphRoot(userId, runner);

      // MacroNode에는 clusterId를 속성으로 저장하지 않고, 스칼라 속성만 upsert합니다.
      // 소속 정보는 아래 BELONGS_TO 관계 생성 쿼리로만 표현합니다.
      const rows = nodes.map((doc) => toNeo4jMacroNode(doc));
      await runner.run(MACRO_GRAPH_CYPHER.upsertNodes, { rows });

      await runner.run(MACRO_GRAPH_CYPHER.linkNodesToGraph, {
        userId,
        rows: nodes.map((n) => ({ id: n.id })),
      });

      // cluster가 이미 존재하면 BELONGS_TO 즉시 생성, 없으면 no-op
      const belongsToRows = nodes
        .filter((n) => n.clusterId)
        .map((n) => ({ nodeId: n.id, clusterId: n.clusterId }));
      if (belongsToRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkNodeBelongsToCluster, {
          userId,
          rows: belongsToRows,
        });
      }
    }, options);
  }

  /**
   * @description 단일 graph node를 부분 업데이트합니다. (Incremental Write)
   *
   * @param userId 사용자 ID입니다.
   * @param id 업데이트할 node id입니다.
   * @param patch 업데이트할 필드 부분 객체입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDoc>,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    // undefined 필드 제거, null은 유지 (deletedAt = null 은 속성 제거 의도)
    const scalarFields: (keyof GraphNodeDoc)[] = [
      'origId',
      'nodeType' as keyof GraphNodeDoc,
      'timestamp',
      'numMessages',
      'embedding',
      'updatedAt',
      'deletedAt',
    ];
    const props: Record<string, unknown> = {};
    for (const field of scalarFields) {
      if (field in patch) props[field] = (patch as Record<string, unknown>)[field] ?? null;
    }
    if (Object.keys(props).length === 0) return;

    await this.runWrite(async (runner) => {
      await runner.run(MACRO_GRAPH_CYPHER.updateNode, { userId, id, props });

      // clusterId 변경 시 BELONGS_TO 관계 갱신
      if (patch.clusterId) {
        await runner.run(MACRO_GRAPH_CYPHER.linkNodeBelongsToCluster, {
          userId,
          rows: [{ nodeId: id, clusterId: patch.clusterId }],
        });
      }
    }, options);
  }

  /**
   * @description 단일 graph edge를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param edge 저장할 graph edge 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 저장된 edge id입니다.
   */
  async upsertEdge(edge: GraphEdgeDoc, options?: MacroGraphStoreOptions): Promise<string> {
    await this.upsertEdges([edge], options);
    return edge.id;
  }

  /**
   * @description 다수의 graph edge를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * @param edges 저장할 graph edge 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertEdges(edges: GraphEdgeDoc[], options?: MacroGraphStoreOptions): Promise<void> {
    if (edges.length === 0) return;
    const userId = edges[0].userId;

    await this.runWrite(async (runner) => {
      await this.ensureGraphRoot(userId, runner);

      const relationRows = edges.map(toNeo4jMacroRelation);
      await runner.run(MACRO_GRAPH_CYPHER.upsertRelations, { rows: relationRows });

      await runner.run(MACRO_GRAPH_CYPHER.linkRelationsToGraph, {
        userId,
        rows: edges.map((e) => ({ id: e.id })),
      });

      // source/target node가 이미 존재해야 합니다 (upsertNodes 이후 호출 전제)
      const endpointRows = edges.map((e) => ({ edgeId: e.id, source: e.source, target: e.target }));
      await runner.run(MACRO_GRAPH_CYPHER.linkRelationEndpoints, { userId, rows: endpointRows });

      const macroRelatedRows = edges.map((e) => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        type: e.type,
        intraCluster: e.intraCluster,
        deletedAt: e.deletedAt ?? null,
      }));
      await runner.run(MACRO_GRAPH_CYPHER.linkMaterializedMacroRelated, {
        userId,
        rows: macroRelatedRows,
      });
    }, options);
  }

  /**
   * @description 단일 cluster를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param cluster 저장할 cluster 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertCluster(cluster: GraphClusterDoc, options?: MacroGraphStoreOptions): Promise<void> {
    await this.upsertClusters([cluster], options);
  }

  /**
   * @description 다수의 cluster를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * upsertNodes 이후 호출 시, 이미 저장된 노드들에 대해 BELONGS_TO 관계를 생성합니다.
   *
   * @param clusters 저장할 cluster 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertClusters(
    clusters: GraphClusterDoc[],
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (clusters.length === 0) return;
    const userId = clusters[0].userId;

    await this.runWrite(async (runner) => {
      await this.ensureGraphRoot(userId, runner);

      const clusterRows = clusters.map(toNeo4jMacroCluster);
      await runner.run(MACRO_GRAPH_CYPHER.upsertClusters, { rows: clusterRows });

      await runner.run(MACRO_GRAPH_CYPHER.linkClustersToGraph, {
        userId,
        rows: clusters.map((c) => ({ id: c.id })),
      });

      // 이미 저장된 node들의 BELONGS_TO 관계 복원
      // (upsertNodes 호출 시 cluster가 없어 생성 못한 관계를 여기서 생성)
      // MacroNode에 외래키 속성을 남기지 않기 때문에 cluster 단독 upsert에서는 관계를 추론하지 않습니다.
      // migration/dual-write 경로의 전체 snapshot upsert가 node 입력의 clusterId로 BELONGS_TO를 명시 생성합니다.
    }, options);
  }

  /**
   * @description 단일 subcluster를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param subcluster 저장할 subcluster 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertSubcluster(
    subcluster: GraphSubclusterDoc,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.upsertSubclusters([subcluster], options);
  }

  /**
   * @description 다수의 subcluster를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * upsertNodes + upsertClusters 이후 호출 시, 모든 도메인 관계를 생성합니다.
   *
   * @param subclusters 저장할 subcluster 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertSubclusters(
    subclusters: GraphSubclusterDoc[],
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (subclusters.length === 0) return;
    const userId = subclusters[0].userId;

    await this.runWrite(async (runner) => {
      await this.ensureGraphRoot(userId, runner);

      const subclusterRows = subclusters.map(toNeo4jMacroSubcluster);
      await runner.run(MACRO_GRAPH_CYPHER.upsertSubclusters, { rows: subclusterRows });

      await runner.run(MACRO_GRAPH_CYPHER.linkSubclustersToGraph, {
        userId,
        rows: subclusters.map((sc) => ({ id: sc.id })),
      });

      // cluster ↔ subcluster (HAS_SUBCLUSTER)
      const clusterLinks = subclusters
        .filter((sc) => sc.clusterId)
        .map((sc) => ({ clusterId: sc.clusterId, subclusterId: sc.id }));
      if (clusterLinks.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclusterToCluster, {
          userId,
          rows: clusterLinks,
        });
      }

      // subcluster ↔ contained nodes (CONTAINS)
      const containsRows: { subclusterId: string; nodeId: number }[] = [];
      for (const sc of subclusters) {
        for (const nid of sc.nodeIds) {
          containsRows.push({ subclusterId: sc.id, nodeId: nid });
        }
      }
      if (containsRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclusterContainsNodes, {
          userId,
          rows: containsRows,
        });
      }

      // subcluster ↔ representative node (REPRESENTS)
      const representsRows = subclusters
        .filter((sc) => sc.representativeNodeId != null)
        .map((sc) => ({ subclusterId: sc.id, nodeId: sc.representativeNodeId }));
      if (representsRows.length > 0) {
        await runner.run(MACRO_GRAPH_CYPHER.linkSubclusterRepresentsNode, {
          userId,
          rows: representsRows,
        });
      }
    }, options);
  }

  /**
   * @description 사용자 graph stats를 독립적으로 저장합니다. (Incremental Write)
   *
   * @param stats 저장할 stats 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async saveStats(stats: GraphStatsDoc, options?: MacroGraphStoreOptions): Promise<void> {
    const { userId } = stats;
    const statsNeo4j = toNeo4jMacroStats(stats);

    await this.runWrite(async (runner) => {
      await this.ensureGraphRoot(userId, runner);
      await runner.run(MACRO_GRAPH_CYPHER.upsertStats, {
        userId,
        id: statsNeo4j.id,
        status: statsNeo4j.status,
        generatedAt: statsNeo4j.generatedAt,
        updatedAt: statsNeo4j.updatedAt ?? null,
        metadataJson: statsNeo4j.metadataJson,
      });
      await runner.run(MACRO_GRAPH_CYPHER.linkStatsToGraph, { userId });
    }, options);
  }

  /**
   * @description 사용자 graph summary를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param userId 사용자 ID입니다.
   * @param summary 저장할 summary 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async upsertGraphSummary(
    userId: string,
    summary: GraphSummaryDoc,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    const summaryNeo4j = toNeo4jMacroSummary(summary);

    await this.runWrite(async (runner) => {
      await this.ensureGraphRoot(userId, runner);
      await runner.run(MACRO_GRAPH_CYPHER.upsertSummary, {
        userId,
        id: summaryNeo4j.id,
        overviewJson: summaryNeo4j.overviewJson,
        clustersJson: summaryNeo4j.clustersJson,
        patternsJson: summaryNeo4j.patternsJson,
        connectionsJson: summaryNeo4j.connectionsJson,
        recommendationsJson: summaryNeo4j.recommendationsJson,
        generatedAt: summaryNeo4j.generatedAt,
        detailLevel: summaryNeo4j.detailLevel,
        deletedAt: summaryNeo4j.deletedAt ?? null,
      });
      await runner.run(MACRO_GRAPH_CYPHER.linkSummaryToGraph, { userId });
    }, options);
  }

  /**
   * @description 논리적 삭제(Soft Delete)된 graph summary를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async restoreGraphSummary(userId: string, options?: MacroGraphStoreOptions): Promise<void> {
    await this.runWrite(async (runner) => {
      await runner.run(MACRO_GRAPH_CYPHER.restoreGraphSummaryNode, { userId });
    }, options);
  }

  /**
   * @description 사용자 Macro Graph 전체 데이터를 삭제합니다.
   *
   * permanent=true이면 MacroGraph 루트 포함 모든 노드를 물리 삭제합니다 (DETACH DELETE).
   * permanent=false(기본)이면 nodes/edges/clusters/subclusters/summary에 deletedAt 타임스탬프를 설정합니다.
   * soft delete 후 restoreAllGraphData로 복원할 수 있습니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param permanent true: hard delete, false/undefined: soft delete
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async deleteAllGraphData(
    userId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (permanent) {
      await this.deleteGraph(userId, options);
      return;
    }
    const deletedAt = Date.now();
    await this.runWrite(async (runner) => {
      await runner.run(MACRO_GRAPH_CYPHER.softDeleteAllNodes, { userId, deletedAt });
      await runner.run(MACRO_GRAPH_CYPHER.softDeleteAllEdges, { userId, deletedAt });
      await runner.run(MACRO_GRAPH_CYPHER.softDeleteAllClusters, { userId, deletedAt });
      await runner.run(MACRO_GRAPH_CYPHER.softDeleteAllSubclusters, { userId, deletedAt });
      await runner.run(MACRO_GRAPH_CYPHER.softDeleteSummaryNode, { userId, deletedAt });
    }, options);
  }

  /**
   * @description 논리적 삭제(Soft Delete)된 사용자 전체 그래프 데이터를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  async restoreAllGraphData(userId: string, options?: MacroGraphStoreOptions): Promise<void> {
    await this.runWrite(async (runner) => {
      await runner.run(MACRO_GRAPH_CYPHER.restoreAllNodes, { userId });
      await runner.run(MACRO_GRAPH_CYPHER.restoreAllEdges, { userId });
      await runner.run(MACRO_GRAPH_CYPHER.restoreAllClusters, { userId });
      await runner.run(MACRO_GRAPH_CYPHER.restoreAllSubclusters, { userId });
      await runner.run(MACRO_GRAPH_CYPHER.restoreGraphSummaryNode, { userId });
    }, options);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read & Delete operations (unchanged below)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * @description graph node id로 단일 MacroNode를 조회합니다.
   * 이 메서드는 특정 ID의 그래프 노드 하나를 찾아서 반환하는 역할을 수행합니다.
   *
   * @param userId 조회 대상 사용자 ID (격리를 위해 사용)
   * @param id graph node id (조회할 노드의 고유 식별자)
   * @param options transaction 등 adapter 전용 옵션 (선택적)
   * @returns GraphNodeDoc (조회된 노드의 DTO 변환 객체) 또는 존재하지 않으면 null 반환
   */
  async findNode(
    userId: string,
    id: number,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc | null> {
    // runRead 래퍼를 통해 Read 전용 트랜잭션 또는 세션을 엽니다.
    return this.runRead(async (runner) => {
      // runner.run을 호출하여 MACRO_GRAPH_CYPHER.findNode 사이퍼 쿼리를 실행합니다.
      // 이 쿼리는 주어진 userId와 id에 해당하는 단일 노드를 매칭하여 반환합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findNode, {
        ...this.readParams(userId, options), // userId와 includeDeleted 옵션을 파라미터로 병합
        id, // 찾고자 하는 노드 id 전달
      });
      // 결과를 unknown 배열로 캐스팅하여 안전하게 길이를 확인합니다.
      const records = result.records as unknown[];
      // 조회된 레코드가 없다면 매칭되는 노드가 없는 것이므로 null을 반환합니다.
      if (records.length === 0) return null;
      // 첫 번째 레코드에서 노드 및 클러스터 관계 속성을 추출하여 HydratedRow 형태로 구성합니다.
      const row = buildNodeRow(records[0] as { get(key: string): unknown });
      // Neo4j 전용 모델 데이터를 프론트엔드/API 호환용 GraphNodeDoc DTO로 변환하여 반환합니다.
      return fromNeo4jMacroNode(row);
    }, options);
  }

  /**
   * @description origId 목록으로 MacroNode들을 조회합니다.
   * 원본 데이터(conversation, note 등)의 ID 배열을 기반으로 매칭되는 그래프 노드들을 한 번에 조회하는 역할을 합니다.
   *
   * @param userId 조회 대상 사용자 ID (권한 및 데이터 격리 목적)
   * @param origIds 원천 데이터 ID 문자열 배열 (여러 개의 원본 ID)
   * @param options transaction 등 adapter 전용 옵션 (선택적)
   * @returns 조회된 노드들의 GraphNodeDoc DTO 배열 (없으면 빈 배열)
   */
  async findNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc[]> {
    // 조회할 ID가 없다면 불필요한 DB 접근을 막고 바로 빈 배열을 반환합니다.
    if (origIds.length === 0) return [];

    // Read 전용 세션/트랜잭션 환경을 열어 작업을 수행합니다.
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.findNodesByOrigIds 쿼리를 실행합니다.
      // 이 쿼리는 주어진 userId를 만족하면서 origId가 origIds 리스트 안에 속하는(IN) 노드들을 전부 조회합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findNodesByOrigIds, {
        ...this.readParams(userId, options), // userId와 삭제 여부 필터 파라미터 제공
        origIds, // IN 절 조회를 위한 배열 파라미터 전달
      });
      // 조회된 결과 레코드들을 순회하면서 각각을 GraphNodeDoc DTO로 파싱 및 매핑하여 배열로 반환합니다.
      return (result.records as unknown[]).map((rec) =>
        fromNeo4jMacroNode(buildNodeRow(rec as { get(key: string): unknown }))
      );
    }, options);
  }

  /**
   * @description 사용자의 활성(삭제되지 않은) 전체 MacroNode 목록을 조회합니다.
   * 해당 유저의 그래프 내에 존재하는 모든 노드를 가져오는 역할을 수행합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션 (includeDeleted 지정 가능)
   * @returns 사용자의 모든 노드 정보를 담은 GraphNodeDoc 배열 반환
   */
  /**
   * @description 사용자의 전체 MacroNode 목록을 soft-deleted 포함하여 조회합니다.
   *
   * GraphDocumentStore.listNodesAll 대응 메서드입니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns soft-deleted 포함 전체 GraphNodeDoc 배열
   */
  async listNodesAll(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDoc[]> {
    return this.listNodes(userId, { ...options, includeDeleted: true });
  }

  async listNodes(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDoc[]> {
    // Read 트랜잭션 래퍼로 조회 작업을 안전하게 실행합니다.
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.listNodes 사이퍼 쿼리를 실행합니다.
      // 이 쿼리는 userId가 일치하고 Graph 루트와 연결된 모든 노드를 순회하여 조회합니다.
      const result = await runner.run(
        MACRO_GRAPH_CYPHER.listNodes,
        this.readParams(userId, options)
      );
      // 반환된 레코드 스트림을 매핑 함수를 통해 클라이언트 친화적인 DTO 배열로 일괄 변환하여 리턴합니다.
      return (result.records as unknown[]).map((rec) =>
        fromNeo4jMacroNode(buildNodeRow(rec as { get(key: string): unknown }))
      );
    }, options);
  }

  /**
   * @description 특정 cluster에 속한 MacroNode 목록을 한정적으로 조회합니다.
   * 특정 군집(클러스터) 내부의 노드들만 모아서 반환하는 역할을 합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param clusterId 노드를 검색할 대상 cluster의 고유 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns 해당 클러스터에 속하는 노드들의 GraphNodeDoc 배열 반환
   */
  async listNodesByCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc[]> {
    // Read 세션 또는 트랜잭션을 엽니다.
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.listNodesByCluster 사이퍼 쿼리를 실행합니다.
      // (n:MacroNode)-[:BELONGS_TO]->(c:MacroCluster {id: clusterId}) 패턴을 매칭하여
      // 지정된 클러스터에 직접 연결된 노드들만 추출합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.listNodesByCluster, {
        ...this.readParams(userId, options), // 사용자 인증 및 soft-delete 옵션 전달
        clusterId, // 찾으려는 대상 클러스터 ID 바인딩
      });
      // 결과 레코드 배열을 순회하여 DTO로 변환하여 리턴합니다.
      return (result.records as unknown[]).map((rec) =>
        fromNeo4jMacroNode(buildNodeRow(rec as { get(key: string): unknown }))
      );
    }, options);
  }

  /**
   * @description 사용자의 활성(삭제되지 않은) MacroRelation 목록을 양쪽 endpoint(source/target) id와 함께 조회합니다.
   * 그래프를 구성하는 모든 간선(엣지) 정보와 연결된 노드들의 ID를 반환하는 역할을 수행합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns 해당 유저의 모든 GraphEdgeDoc DTO 배열
   */
  async listEdges(userId: string, options?: MacroGraphStoreOptions): Promise<GraphEdgeDoc[]> {
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.listEdges 쿼리를 실행하여 유저 그래프 내의 유효한 엣지를 모두 가져옵니다.
      // (n1)-[rel:MACRO_RELATED]->(n2) 패턴을 매칭하여 간선 객체와 양 끝단의 id를 추출합니다.
      const result = await runner.run(
        MACRO_GRAPH_CYPHER.listEdges,
        this.readParams(userId, options)
      );

      // 반환된 레코드들을 순회하며 간선 모델과 source/target ID를 포함하는 row 구조체로 매핑합니다.
      return (result.records as unknown[]).map((rec) => {
        const record = rec as { get(key: string): unknown };
        const relProps = (record.get('rel') as { properties: Record<string, unknown> }).properties;
        const row = {
          relation: {
            id: String(relProps['id'] ?? ''),
            userId: String(relProps['userId'] ?? ''),
            weight: toJsNumber(relProps['weight']),
            type: relProps['type'] as 'hard' | 'insight',
            intraCluster: Boolean(relProps['intraCluster']),
            createdAt: relProps['createdAt'] as string | undefined,
            updatedAt: relProps['updatedAt'] as string | undefined,
            deletedAt: relProps['deletedAt'] as number | null | undefined,
          },
          sourceNodeId: toJsNumber(record.get('sourceNodeId')),
          targetNodeId: toJsNumber(record.get('targetNodeId')),
        };
        // DTO로 최종 파싱하여 반환합니다.
        return fromNeo4jMacroRelation(row);
      });
    }, options);
  }

  /**
   * @description cluster id로 단일 MacroCluster를 조회하며, 포함된 노드의 개수(size)도 함께 반환합니다.
   * 특정 클러스터의 메타정보와, 해당 클러스터가 소유한(BELONGS_TO) 노드의 총 수를 파악할 때 사용됩니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param clusterId 조회할 클러스터의 고유 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphClusterDoc DTO 또는 존재하지 않으면 null
   */
  async findCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphClusterDoc | null> {
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.findCluster 쿼리를 실행합니다.
      // 특정 클러스터를 찾고, 해당 클러스터로 연결된 BELONGS_TO 엣지의 개수를 COUNT() 하여 size로 묶어 반환합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findCluster, {
        ...this.readParams(userId, options),
        clusterId,
      });
      const records = result.records as unknown[];
      if (records.length === 0) return null; // 클러스터가 존재하지 않는 경우

      const record = records[0] as { get(key: string): unknown };
      const clusterProps = (record.get('c') as { properties: Record<string, unknown> }).properties;

      // 클러스터 메타 속성과 조인/집계된 size를 포함하여 Row 객체를 생성합니다.
      const row = {
        cluster: {
          id: String(clusterProps['id'] ?? ''),
          userId: String(clusterProps['userId'] ?? ''),
          name: String(clusterProps['name'] ?? ''),
          description: String(clusterProps['description'] ?? ''),
          themes: Array.isArray(clusterProps['themes']) ? (clusterProps['themes'] as string[]) : [],
          createdAt: clusterProps['createdAt'] as string | undefined,
          updatedAt: clusterProps['updatedAt'] as string | undefined,
          deletedAt: clusterProps['deletedAt'] as number | null | undefined,
        },
        size: toJsNumber(record.get('size')), // COUNT 집계 결과를 number로 형변환
      };
      // GraphClusterDoc DTO로 변환하여 리턴합니다.
      return fromNeo4jMacroCluster(row);
    }, options);
  }

  /**
   * @description 사용자의 활성 MacroCluster 전체 목록을 각각의 속한 노드 개수(size)와 함께 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns 모든 클러스터 정보를 담은 GraphClusterDoc DTO 배열
   */
  async listClusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphClusterDoc[]> {
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.listClusters 쿼리를 실행하여 유저의 모든 클러스터 및 각 size 집계를 가져옵니다.
      const result = await runner.run(
        MACRO_GRAPH_CYPHER.listClusters,
        this.readParams(userId, options)
      );

      return (result.records as unknown[]).map((rec) => {
        const record = rec as { get(key: string): unknown };
        const clusterProps = (record.get('c') as { properties: Record<string, unknown> })
          .properties;
        const row = {
          cluster: {
            id: String(clusterProps['id'] ?? ''),
            userId: String(clusterProps['userId'] ?? ''),
            name: String(clusterProps['name'] ?? ''),
            description: String(clusterProps['description'] ?? ''),
            themes: Array.isArray(clusterProps['themes'])
              ? (clusterProps['themes'] as string[])
              : [],
            createdAt: clusterProps['createdAt'] as string | undefined,
            updatedAt: clusterProps['updatedAt'] as string | undefined,
            deletedAt: clusterProps['deletedAt'] as number | null | undefined,
          },
          size: toJsNumber(record.get('size')),
        };
        // 맵핑 후 리턴
        return fromNeo4jMacroCluster(row);
      });
    }, options);
  }

  /**
   * @description 사용자의 활성 MacroSubcluster 목록을 조회합니다.
   * 이 과정에서 해당 서브클러스터가 포함하고 있는 노드들의 ID 리스트와 대표 노드 ID, 부모 클러스터 ID까지 집계하여 함께 반환합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns 서브클러스터 정보들이 포함된 GraphSubclusterDoc 배열
   */
  async listSubclusters(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphSubclusterDoc[]> {
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.listSubclusters 쿼리를 실행하여 Subcluster와 연관된
      // CONTAINS 관계의 노드 ID들, REPRESENTS 관계의 대표 노드 ID, HAS_SUBCLUSTER 관계의 부모 클러스터 ID를 추출합니다.
      const result = await runner.run(
        MACRO_GRAPH_CYPHER.listSubclusters,
        this.readParams(userId, options)
      );

      return (result.records as unknown[]).map((rec) => {
        const record = rec as { get(key: string): unknown };
        const scProps = (record.get('sc') as { properties: Record<string, unknown> }).properties;
        // Neo4j에서 COLLECT()로 반환된 노드 ID 배열을 JS number 배열로 파싱
        const nodeIds = toJsNumberArray(
          Array.isArray(record.get('nodeIds')) ? (record.get('nodeIds') as unknown[]) : []
        );
        const repId = record.get('representativeNodeId');
        const row = {
          subcluster: {
            id: String(scProps['id'] ?? ''),
            userId: String(scProps['userId'] ?? ''),
            topKeywords: Array.isArray(scProps['topKeywords'])
              ? (scProps['topKeywords'] as string[])
              : [],
            density: toJsNumber(scProps['density']),
            createdAt: scProps['createdAt'] as string | undefined,
            updatedAt: scProps['updatedAt'] as string | undefined,
            deletedAt: scProps['deletedAt'] as number | null | undefined,
          },
          clusterId: String(record.get('clusterId') ?? ''),
          nodeIds,
          representativeNodeId: repId != null ? toJsNumber(repId) : 0,
          size: toJsNumber(record.get('size')),
          density: toJsNumber(record.get('density')),
        };
        return fromNeo4jMacroSubcluster(row);
      });
    }, options);
  }

  /**
   * @description 사용자 그래프의 전체 통계(MacroStats)를 조회합니다.
   * 저장되어 있는 정적 count 값이 아닌, Neo4j의 실제 그래프 관계(BELONGS_TO, MACRO_RELATED 등)를 집계하여 반환합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns 집계된 통계 정보가 담긴 GraphStatsDoc DTO (통계 노드가 없으면 null)
   */
  async getStats(userId: string, options?: MacroGraphStoreOptions): Promise<GraphStatsDoc | null> {
    return this.runRead(async (runner) => {
      // MACRO_GRAPH_CYPHER.getStats 쿼리를 실행합니다.
      // 이 쿼리는 Stats 노드 메타데이터를 가져오는 동시에, 해당 유저의 nodes, edges, clusters의 실제 개수를 COUNT()로 집계합니다.
      const result = await runner.run(
        MACRO_GRAPH_CYPHER.getStats,
        this.readParams(userId, options)
      );
      const records = result.records as unknown[];
      if (records.length === 0) return null; // 통계 노드가 생성되지 않은 경우

      const record = records[0] as { get(key: string): unknown };
      // 통계 노드의 속성을 추출합니다.
      const stProps = (record.get('st') as { properties: Record<string, unknown> }).properties;

      // 통계 메타데이터와 동적으로 집계된 nodes, edges, clusters 수를 하나의 Row 구조체로 묶습니다.
      const row = {
        stats: {
          id: String(stProps['id'] ?? userId),
          userId: String(stProps['userId'] ?? userId),
          status: stProps['status'] as GraphStatsDoc['status'],
          generatedAt: String(stProps['generatedAt'] ?? ''),
          updatedAt: stProps['updatedAt'] as string | undefined,
          metadataJson: String(stProps['metadataJson'] ?? '{}'),
        },
        nodes: toJsNumber(record.get('nodes')),
        edges: toJsNumber(record.get('edges')),
        clusters: toJsNumber(record.get('clusters')),
      };

      // GraphStatsDoc DTO로 변환하여 반환합니다.
      return fromNeo4jMacroStats(row);
    }, options);
  }

  /**
   * @description 사용자의 전체 그래프 요약(MacroSummary)을 동적 관계 집계와 함께 조회합니다.
   * 단순히 저장된 요약 노드뿐만 아니라, 현재 그래프를 구성하는 각 노드 타입별 카운트와 클러스터들의 크기를 실제로 집계하여 최신 상태로 반환합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphSummaryDoc DTO 또는 존재하지 않으면 null
   */
  async getGraphSummary(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphSummaryDoc | null> {
    return this.runRead(async (runner) => {
      // 1. summary 노드 자체의 속성(JSON 포맷으로 저장된 overview 등)을 조회합니다.
      const summaryResult = await runner.run(
        MACRO_GRAPH_CYPHER.getGraphSummary,
        this.readParams(userId, options)
      );
      const summaryRecords = summaryResult.records as unknown[];
      if (summaryRecords.length === 0) return null; // 요약 데이터가 없으면 종료

      const summaryRecord = summaryRecords[0] as { get(key: string): unknown };
      const smProps = (summaryRecord.get('sm') as { properties: Record<string, unknown> })
        .properties;

      // JSON 문자열 형태로 저장된 속성들을 Neo4jMacroSummaryNode 타입 구조체로 매핑합니다.
      const summaryNode: Neo4jMacroSummaryNode = {
        id: String(smProps['id'] ?? userId),
        userId: String(smProps['userId'] ?? userId),
        overviewJson: String(smProps['overviewJson'] ?? '{}'),
        clustersJson: String(smProps['clustersJson'] ?? '[]'),
        patternsJson: String(smProps['patternsJson'] ?? '[]'),
        connectionsJson: String(smProps['connectionsJson'] ?? '[]'),
        recommendationsJson: String(smProps['recommendationsJson'] ?? '[]'),
        generatedAt: String(smProps['generatedAt'] ?? ''),
        detailLevel: (smProps['detailLevel'] as 'brief' | 'standard' | 'detailed') ?? 'standard',
        deletedAt: smProps['deletedAt'] as number | null | undefined,
      };

      // 2. overview 필드 구성을 위해 현재 활성 그래프의 노드 타입(conversation, note 등)별 개수를 별도의 집계 쿼리로 가져옵니다.
      const countsResult = await runner.run(
        MACRO_GRAPH_CYPHER.getSummaryNodeCounts,
        this.readParams(userId, options)
      );
      const countsRecords = countsResult.records as unknown[];
      let totalSourceNodes = 0;
      let totalConversations = 0;
      let totalNotes = 0;
      let totalNotions = 0;
      if (countsRecords.length > 0) {
        const cr = countsRecords[0] as { get(key: string): unknown };
        totalSourceNodes = toJsNumber(cr.get('totalSourceNodes'));
        totalConversations = toJsNumber(cr.get('totalConversations'));
        totalNotes = toJsNumber(cr.get('totalNotes'));
        totalNotions = toJsNumber(cr.get('totalNotions'));
      }

      // 3. cluster size 집계
      const clusterSizesResult = await runner.run(MACRO_GRAPH_CYPHER.getSummaryClusterSizes, {
        ...this.readParams(userId, options),
      });
      const clusterSizes: Record<string, number> = {};
      for (const rec of clusterSizesResult.records as unknown[]) {
        const cr = rec as { get(key: string): unknown };
        const cId = String(cr.get('clusterId') ?? '');
        const cSize = toJsNumber(cr.get('size'));
        if (cId) clusterSizes[cId] = cSize;
      }

      const aggregateContext: Neo4jMacroSummaryAggregateContext = {
        totalSourceNodes,
        totalConversations,
        totalNotes,
        totalNotions,
        clusterSizes,
      };

      return fromNeo4jMacroSummary(summaryNode, aggregateContext);
    }, options);
  }

  /**
   * @description 단일 MacroNode를 삭제합니다. (Soft Delete 또는 Hard Delete)
   *
   * @param userId 요청을 수행하는 사용자 ID (권한 확인 및 데이터 격리)
   * @param id 삭제할 노드의 고유 ID
   * @param permanent true일 경우 영구 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션
   * @returns 삭제 작업 완료 시점을 나타내는 Promise
   */
  async deleteNode(
    userId: string,
    id: number,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    // 다중 삭제 메서드에 단일 ID 배열을 전달하여 재사용합니다.
    await this.deleteNodes(userId, [id], permanent, options);
  }

  /**
   * @description 다수의 MacroNode를 일괄 삭제합니다. (Soft Delete 또는 Hard Delete)
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param ids 삭제할 대상 노드들의 ID 배열
   * @param permanent true면 DB에서 완전히 제거, false면 deletedAt 타임스탬프만 업데이트합니다.
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteNodes(
    userId: string,
    ids: number[],
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (ids.length === 0) return; // 삭제할 ID가 없으면 바로 종료합니다.
    const deletedAt = Date.now(); // Soft delete 시 사용할 현재 타임스탬프

    // Write 트랜잭션/세션을 통해 안전하게 삭제 작업을 수행합니다.
    await this.runWrite(async (runner) => {
      // permanent 옵션에 따라 Hard Delete 또는 Soft Delete Cypher 쿼리를 동적으로 선택하여 실행합니다.
      // Hard Delete: 노드와 연결된 모든 간선(엣지)를 DETACH DELETE 합니다.
      // Soft Delete: 노드의 deletedAt 속성 및 연결된 엣지들의 deletedAt 속성을 업데이트합니다.
      await runner.run(
        permanent
          ? MACRO_GRAPH_CYPHER.hardDeleteNodesByIds
          : MACRO_GRAPH_CYPHER.softDeleteNodesByIds,
        { userId, ids, deletedAt }
      );
    }, options);
  }

  /**
   * @description 원본 문서의 ID(origIds)를 기반으로 대응되는 MacroNode들을 삭제합니다.
   * 외부 시스템(Mongo 등)의 식별자를 기준으로 삭제할 때 유용합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param origIds 원천 데이터 ID 배열
   * @param permanent true: 영구 삭제, false: 논리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (origIds.length === 0) return;

    // Write 트랜잭션을 엽니다. origId 기반 ID 조회와 실제 삭제를 하나의 트랜잭션으로 묶습니다.
    await this.runWrite(async (runner) => {
      // 먼저 origId 리스트에 해당하는 Neo4j 상의 실제 Node ID(숫자)들을 조회합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findNodeIdsByOrigIds, {
        userId,
        origIds,
      });
      const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
      // 반환된 레코드에서 ids 리스트를 JS number 배열로 파싱합니다.
      const ids = record ? toJsNumberArray((record.get('ids') as unknown[]) ?? []) : [];
      if (ids.length === 0) return; // 변환된 ID가 하나도 없다면 삭제 작업을 중단합니다.

      // 변환된 내부 ID 배열을 이용해 실제 삭제 쿼리(Hard/Soft)를 실행합니다.
      await runner.run(
        permanent
          ? MACRO_GRAPH_CYPHER.hardDeleteNodesByIds
          : MACRO_GRAPH_CYPHER.softDeleteNodesByIds,
        { userId, ids, deletedAt: Date.now() }
      );
    }, options);
  }

  /**
   * @description Soft Delete된 단일 MacroNode를 복구합니다.
   * deletedAt 타임스탬프를 제거하여 다시 활성 상태로 되돌립니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param id 복구할 노드의 고유 ID
   * @param options transaction 등 adapter 전용 옵션
   */
  async restoreNode(userId: string, id: number, options?: MacroGraphStoreOptions): Promise<void> {
    // Write 트랜잭션/세션으로 감쌉니다.
    await this.runWrite(async (runner) => {
      // MACRO_GRAPH_CYPHER.restoreNodesByIds 쿼리를 실행하여 단일 노드의 deletedAt 속성을 지웁니다.
      // 연결된 간선들도 함께 복구 로직이 반영될 수 있습니다. (Cypher 쿼리에 정의됨)
      await runner.run(MACRO_GRAPH_CYPHER.restoreNodesByIds, { userId, ids: [id] });
    }, options);
  }

  /**
   * @description 원본 문서의 ID(origIds)를 기반으로 Soft Delete된 MacroNode들을 복구합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param origIds 복구할 대상의 원천 데이터 ID 배열
   * @param options transaction 등 adapter 전용 옵션
   */
  async restoreNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (origIds.length === 0) return;

    // Write 트랜잭션으로 ID 조회 및 복구를 원자적으로 처리합니다.
    await this.runWrite(async (runner) => {
      // origId 리스트에 대응되는 Neo4j 내부 Node ID 들을 찾습니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findNodeIdsByOrigIds, {
        userId,
        origIds,
      });
      const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
      // 내부 ID 배열로 파싱합니다.
      const ids = record ? toJsNumberArray((record.get('ids') as unknown[]) ?? []) : [];
      if (ids.length > 0) {
        // 조회된 내부 ID들을 이용해 복구(deletedAt 제거) 쿼리를 실행합니다.
        await runner.run(MACRO_GRAPH_CYPHER.restoreNodesByIds, { userId, ids });
      }
    }, options);
  }

  /**
   * @description 특정 엣지(간선) 1개를 삭제합니다.
   * 현재는 edgeId 기반의 삭제를 영구 삭제 방식으로 구현하여 사용 중인 경우가 많습니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param edgeId 삭제할 엣지의 고유 식별자 (Neo4j 내부 ID 문자열)
   * @param permanent true면 영구 삭제(Hard Delete), false면 논리적 삭제(Soft Delete)입니다.
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteEdge(
    userId: string,
    edgeId: string,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      if (permanent) {
        await runner.run(MACRO_GRAPH_CYPHER.deleteEdgeById, { userId, edgeId });
      } else {
        await runner.run(MACRO_GRAPH_CYPHER.softDeleteEdgesByIds, {
          userId,
          edgeIds: [edgeId],
          deletedAt: Date.now(),
        });
      }
    }, options);
  }

  /**
   * @description 두 노드(source, target) 사이에 존재하는 엣지(들)를 찾아 삭제합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param source 소스 노드의 고유 ID
   * @param target 타겟 노드의 고유 ID
   * @param permanent true면 영구 삭제, false면 논리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      // 1. source와 target 사이에 존재하는 엣지들의 ID 목록을 조회합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findEdgeIdsBetween, {
        userId,
        source,
        target,
      });
      const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
      const edgeIds = record ? ((record.get('edgeIds') as string[]) ?? []) : [];
      if (edgeIds.length === 0) return; // 연결된 엣지가 없으면 작업 종료

      // 2. 조회된 엣지 ID들을 기반으로 영구 또는 논리적 삭제를 수행합니다.
      await runner.run(
        permanent
          ? MACRO_GRAPH_CYPHER.hardDeleteEdgesByIds
          : MACRO_GRAPH_CYPHER.softDeleteEdgesByIds,
        { userId, edgeIds, deletedAt: Date.now() }
      );
    }, options);
  }

  /**
   * @description 특정 노드들(ids)과 연결된 모든 엣지들을 찾아 삭제합니다.
   * 노드 자체가 아니라, 해당 노드들에 인접한 간선들만 제거할 때 사용됩니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param ids 대상 노드 ID 배열
   * @param permanent true면 영구 삭제, false면 논리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.runWrite(async (runner) => {
      // 1. 주어진 노드 배열(ids)에 연결된(Source 또는 Target) 모든 엣지의 ID를 조회합니다.
      const result = await runner.run(MACRO_GRAPH_CYPHER.findEdgeIdsByNodeIds, {
        userId,
        ids,
      });
      const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
      const edgeIds = record ? ((record.get('edgeIds') as string[]) ?? []) : [];
      if (edgeIds.length === 0) return; // 대상 엣지가 없으면 작업 중단

      // 2. 찾아낸 간선 ID들을 대상으로 일괄 삭제 쿼리를 실행합니다.
      await runner.run(
        permanent
          ? MACRO_GRAPH_CYPHER.hardDeleteEdgesByIds
          : MACRO_GRAPH_CYPHER.softDeleteEdgesByIds,
        { userId, edgeIds, deletedAt: Date.now() }
      );
    }, options);
  }

  /**
   * @description 논리적으로 삭제(Soft Delete)된 특정 간선을 복구합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param edgeId 복구할 간선의 식별자
   * @param options transaction 등 adapter 전용 옵션
   */
  async restoreEdge(
    userId: string,
    edgeId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      // edgeId에 해당하는 릴레이션의 deletedAt 속성을 지워 복구합니다.
      await runner.run(MACRO_GRAPH_CYPHER.restoreEdgeById, { userId, edgeId });
    }, options);
  }

  /**
   * @description 특정 Cluster(클러스터)를 삭제합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param clusterId 삭제할 클러스터의 고유 식별자 문자열
   * @param permanent true면 영구 삭제(Hard Delete), false면 논리적 삭제(Soft Delete)입니다.
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteCluster(
    userId: string,
    clusterId: string,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      if (permanent) {
        await runner.run(MACRO_GRAPH_CYPHER.deleteClusterById, { userId, clusterId });
      } else {
        await runner.run(MACRO_GRAPH_CYPHER.softDeleteClusterById, {
          userId,
          clusterId,
          deletedAt: Date.now(),
        });
      }
    }, options);
  }

  /**
   * @description 논리적으로 삭제된 특정 Cluster를 복구합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param clusterId 복구할 클러스터의 고유 식별자 문자열
   * @param options transaction 등 adapter 전용 옵션
   */
  async restoreCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      // 클러스터 노드의 deletedAt 속성을 제거합니다.
      await runner.run(MACRO_GRAPH_CYPHER.restoreClusterById, { userId, clusterId });
    }, options);
  }

  /**
   * @description 특정 Subcluster(서브클러스터)를 삭제합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param subclusterId 삭제할 서브클러스터의 고유 식별자 문자열
   * @param _permanent 영구 삭제 여부 플래그
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteSubcluster(
    userId: string,
    subclusterId: string,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      if (permanent) {
        await runner.run(MACRO_GRAPH_CYPHER.deleteSubclusterById, { userId, subclusterId });
      } else {
        await runner.run(MACRO_GRAPH_CYPHER.softDeleteSubclusterById, {
          userId,
          subclusterId,
          deletedAt: Date.now(),
        });
      }
    }, options);
  }

  /**
   * @description 논리적으로 삭제된 특정 Subcluster를 복구합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param subclusterId 복구할 서브클러스터의 고유 식별자 문자열
   * @param options transaction 등 adapter 전용 옵션
   */
  async restoreSubcluster(
    userId: string,
    subclusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      // 서브클러스터 노드의 deletedAt을 제거하여 복구합니다.
      await runner.run(MACRO_GRAPH_CYPHER.restoreSubclusterById, { userId, subclusterId });
    }, options);
  }

  /**
   * @description 사용자의 그래프 통계(MacroStats) 데이터를 삭제합니다.
   *
   * @param userId 요청을 수행하는 사용자 ID
   * @param _permanent 영구 삭제 여부 플래그
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteStats(
    userId: string,
    _permanent = true,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(async (runner) => {
      // 통계 데이터를 저장하는 노드(MacroStats)를 삭제합니다.
      await runner.run(MACRO_GRAPH_CYPHER.deleteStats, { userId });
    }, options);
  }

  /**
   * @description 사용자의 Macro Graph 전체를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteGraph(userId: string, options?: MacroGraphStoreOptions): Promise<void> {
    const tx = options?.transaction as ManagedTransaction | undefined;
    if (tx) {
      // 외부에서 주입된 트랜잭션이 있으면 해당 트랜잭션 컨텍스트 내에서 삭제 쿼리를 실행합니다.
      await tx.run(MACRO_GRAPH_CYPHER.deleteGraph, { userId });
      return;
    }
    // 주입된 트랜잭션이 없다면, 새 WRITE 세션을 엽니다.
    const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      // executeWrite를 통해 자동 재시도 및 트랜잭션 관리가 포함된 쓰기 작업을 수행합니다.
      await session.executeWrite((innerTx) =>
        innerTx.run(MACRO_GRAPH_CYPHER.deleteGraph, { userId })
      );
    } finally {
      // 사용이 완료된 세션은 리소스 누수 방지를 위해 반드시 종료합니다.
      await session.close();
    }
  }

  /**
   * @description 사용자의 MacroSummary를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   */
  async deleteGraphSummary(userId: string, options?: MacroGraphStoreOptions): Promise<void> {
    const tx = options?.transaction as ManagedTransaction | undefined;
    if (tx) {
      // 주입된 트랜잭션이 존재하면 해당 트랜잭션을 사용하여 Summary 노드를 삭제합니다.
      await tx.run(MACRO_GRAPH_CYPHER.deleteGraphSummary, { userId });
      return;
    }
    // 주입된 트랜잭션이 없으므로 직접 WRITE 세션을 생성합니다.
    const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      // executeWrite 내부에서 트랜잭션을 열어 삭제 쿼리를 실행합니다.
      await session.executeWrite((innerTx) =>
        innerTx.run(MACRO_GRAPH_CYPHER.deleteGraphSummary, { userId })
      );
    } finally {
      // 작업이 끝난 뒤 세션을 닫아줍니다.
      await session.close();
    }
  }
}
