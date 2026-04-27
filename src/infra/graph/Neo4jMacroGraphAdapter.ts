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
      embedding: Array.isArray(props['embedding'])
        ? (props['embedding'] as number[])
        : undefined,
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
    fn: (runner: { run(query: string, params?: Record<string, unknown>): Promise<{ records: unknown[] }> }) => Promise<T>,
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
        await runner.run(MACRO_GRAPH_CYPHER.linkNodeBelongsToCluster, { userId, rows: belongsToRows });
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
   * @description graph node id로 단일 MacroNode를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param id graph node id
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphNodeDoc 또는 null
   */
  async findNode(
    userId: string,
    id: number,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc | null> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.findNode, {
        ...this.readParams(userId, options),
        id,
      });
      const records = result.records as unknown[];
      if (records.length === 0) return null;
      const row = buildNodeRow(records[0] as { get(key: string): unknown });
      return fromNeo4jMacroNode(row);
    }, options);
  }

  /**
   * @description origId 목록으로 MacroNode를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param origIds 원천 데이터 ID 목록
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphNodeDoc 배열
   */
  async findNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc[]> {
    if (origIds.length === 0) return [];
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.findNodesByOrigIds, {
        ...this.readParams(userId, options),
        origIds,
      });
      return (result.records as unknown[]).map((rec) =>
        fromNeo4jMacroNode(buildNodeRow(rec as { get(key: string): unknown }))
      );
    }, options);
  }

  /**
   * @description 사용자의 활성 MacroNode 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphNodeDoc 배열
   */
  async listNodes(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDoc[]> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.listNodes, this.readParams(userId, options));
      return (result.records as unknown[]).map((rec) =>
        fromNeo4jMacroNode(buildNodeRow(rec as { get(key: string): unknown }))
      );
    }, options);
  }

  /**
   * @description 특정 cluster에 속한 MacroNode 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param clusterId 조회할 cluster id
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphNodeDoc 배열
   */
  async listNodesByCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc[]> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.listNodesByCluster, {
        ...this.readParams(userId, options),
        clusterId,
      });
      return (result.records as unknown[]).map((rec) =>
        fromNeo4jMacroNode(buildNodeRow(rec as { get(key: string): unknown }))
      );
    }, options);
  }

  /**
   * @description 사용자의 활성 MacroRelation 목록을 endpoint id와 함께 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphEdgeDoc 배열
   */
  async listEdges(userId: string, options?: MacroGraphStoreOptions): Promise<GraphEdgeDoc[]> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.listEdges, this.readParams(userId, options));
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
        return fromNeo4jMacroRelation(row);
      });
    }, options);
  }

  /**
   * @description cluster id로 단일 MacroCluster를 BELONGS_TO count와 함께 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param clusterId 조회할 cluster id
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphClusterDoc 또는 null
   */
  async findCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphClusterDoc | null> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.findCluster, {
        ...this.readParams(userId, options),
        clusterId,
      });
      const records = result.records as unknown[];
      if (records.length === 0) return null;
      const record = records[0] as { get(key: string): unknown };
      const clusterProps = (record.get('c') as { properties: Record<string, unknown> }).properties;
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
        size: toJsNumber(record.get('size')),
      };
      return fromNeo4jMacroCluster(row);
    }, options);
  }

  /**
   * @description 사용자의 활성 MacroCluster 목록을 BELONGS_TO count와 함께 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphClusterDoc 배열
   */
  async listClusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphClusterDoc[]> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.listClusters, this.readParams(userId, options));
      return (result.records as unknown[]).map((rec) => {
        const record = rec as { get(key: string): unknown };
        const clusterProps = (record.get('c') as { properties: Record<string, unknown> }).properties;
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
          size: toJsNumber(record.get('size')),
        };
        return fromNeo4jMacroCluster(row);
      });
    }, options);
  }

  /**
   * @description 사용자의 활성 MacroSubcluster 목록을 관계 집계와 함께 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphSubclusterDoc 배열
   */
  async listSubclusters(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphSubclusterDoc[]> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.listSubclusters, this.readParams(userId, options));
      return (result.records as unknown[]).map((rec) => {
        const record = rec as { get(key: string): unknown };
        const scProps = (record.get('sc') as { properties: Record<string, unknown> }).properties;
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
   * @description MacroStats를 graph count 집계와 함께 조회합니다.
   *
   * nodes/edges/clusters count는 저장된 값이 아닌 실제 관계 집계로 복원됩니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphStatsDoc 또는 null
   */
  async getStats(userId: string, options?: MacroGraphStoreOptions): Promise<GraphStatsDoc | null> {
    return this.runRead(async (runner) => {
      const result = await runner.run(MACRO_GRAPH_CYPHER.getStats, this.readParams(userId, options));
      const records = result.records as unknown[];
      if (records.length === 0) return null;
      const record = records[0] as { get(key: string): unknown };
      const stProps = (record.get('st') as { properties: Record<string, unknown> }).properties;
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
      return fromNeo4jMacroStats(row);
    }, options);
  }

  /**
   * @description MacroSummary를 관계 집계 context와 함께 조회합니다.
   *
   * overview count와 cluster size는 별도 집계 쿼리로 복원합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param options transaction 등 adapter 전용 옵션
   * @returns GraphSummaryDoc 또는 null
   */
  async getGraphSummary(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphSummaryDoc | null> {
    return this.runRead(async (runner) => {
      // 1. summary 노드 조회
      const summaryResult = await runner.run(MACRO_GRAPH_CYPHER.getGraphSummary, this.readParams(userId, options));
      const summaryRecords = summaryResult.records as unknown[];
      if (summaryRecords.length === 0) return null;

      const summaryRecord = summaryRecords[0] as { get(key: string): unknown };
      const smProps = (
        summaryRecord.get('sm') as { properties: Record<string, unknown> }
      ).properties;
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

      // 2. node type count 집계
      const countsResult = await runner.run(MACRO_GRAPH_CYPHER.getSummaryNodeCounts, this.readParams(userId, options));
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

  async deleteNode(
    userId: string,
    id: number,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.deleteNodes(userId, [id], permanent, options);
  }

  async deleteNodes(
    userId: string,
    ids: number[],
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (ids.length === 0) return;
    const deletedAt = Date.now();
    await this.runWrite(
      async (runner) => {
        await runner.run(
          permanent
            ? MACRO_GRAPH_CYPHER.hardDeleteNodesByIds
            : MACRO_GRAPH_CYPHER.softDeleteNodesByIds,
          { userId, ids, deletedAt }
        );
      },
      options
    );
  }

  async deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (origIds.length === 0) return;
    await this.runWrite(
      async (runner) => {
        const result = await runner.run(MACRO_GRAPH_CYPHER.findNodeIdsByOrigIds, {
          userId,
          origIds,
        });
        const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
        const ids = record ? toJsNumberArray((record.get('ids') as unknown[]) ?? []) : [];
        if (ids.length === 0) return;
        await runner.run(
          permanent
            ? MACRO_GRAPH_CYPHER.hardDeleteNodesByIds
            : MACRO_GRAPH_CYPHER.softDeleteNodesByIds,
          { userId, ids, deletedAt: Date.now() }
        );
      },
      options
    );
  }

  async restoreNode(
    userId: string,
    id: number,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.restoreNodesByIds, { userId, ids: [id] });
      },
      options
    );
  }

  async restoreNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (origIds.length === 0) return;
    await this.runWrite(
      async (runner) => {
        const result = await runner.run(MACRO_GRAPH_CYPHER.findNodeIdsByOrigIds, {
          userId,
          origIds,
        });
        const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
        const ids = record ? toJsNumberArray((record.get('ids') as unknown[]) ?? []) : [];
        if (ids.length > 0) {
          await runner.run(MACRO_GRAPH_CYPHER.restoreNodesByIds, { userId, ids });
        }
      },
      options
    );
  }

  async deleteEdge(
    userId: string,
    edgeId: string,
    _permanent = true,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.deleteEdgeById, { userId, edgeId });
      },
      options
    );
  }

  async deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        const result = await runner.run(MACRO_GRAPH_CYPHER.findEdgeIdsBetween, {
          userId,
          source,
          target,
        });
        const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
        const edgeIds = record ? ((record.get('edgeIds') as string[]) ?? []) : [];
        if (edgeIds.length === 0) return;
        await runner.run(
          permanent
            ? MACRO_GRAPH_CYPHER.hardDeleteEdgesByIds
            : MACRO_GRAPH_CYPHER.softDeleteEdgesByIds,
          { userId, edgeIds, deletedAt: Date.now() }
        );
      },
      options
    );
  }

  async deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent = false,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.runWrite(
      async (runner) => {
        const result = await runner.run(MACRO_GRAPH_CYPHER.findEdgeIdsByNodeIds, {
          userId,
          ids,
        });
        const record = (result.records as unknown[])[0] as { get(key: string): unknown } | undefined;
        const edgeIds = record ? ((record.get('edgeIds') as string[]) ?? []) : [];
        if (edgeIds.length === 0) return;
        await runner.run(
          permanent
            ? MACRO_GRAPH_CYPHER.hardDeleteEdgesByIds
            : MACRO_GRAPH_CYPHER.softDeleteEdgesByIds,
          { userId, edgeIds, deletedAt: Date.now() }
        );
      },
      options
    );
  }

  async restoreEdge(
    userId: string,
    edgeId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.restoreEdgeById, { userId, edgeId });
      },
      options
    );
  }

  async deleteCluster(
    userId: string,
    clusterId: string,
    _permanent = true,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.deleteClusterById, { userId, clusterId });
      },
      options
    );
  }

  async restoreCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.restoreClusterById, { userId, clusterId });
      },
      options
    );
  }

  async deleteSubcluster(
    userId: string,
    subclusterId: string,
    _permanent = true,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.deleteSubclusterById, { userId, subclusterId });
      },
      options
    );
  }

  async restoreSubcluster(
    userId: string,
    subclusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.restoreSubclusterById, { userId, subclusterId });
      },
      options
    );
  }

  async deleteStats(
    userId: string,
    _permanent = true,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    await this.runWrite(
      async (runner) => {
        await runner.run(MACRO_GRAPH_CYPHER.deleteStats, { userId });
      },
      options
    );
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
      await tx.run(MACRO_GRAPH_CYPHER.deleteGraph, { userId });
      return;
    }
    const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((innerTx) =>
        innerTx.run(MACRO_GRAPH_CYPHER.deleteGraph, { userId })
      );
    } finally {
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
      await tx.run(MACRO_GRAPH_CYPHER.deleteGraphSummary, { userId });
      return;
    }
    const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((innerTx) =>
        innerTx.run(MACRO_GRAPH_CYPHER.deleteGraphSummary, { userId })
      );
    } finally {
      await session.close();
    }
  }
}
