import * as Sentry from '@sentry/node';

import type { GraphDocumentStore, RepoOptions } from '../../core/ports/GraphDocumentStore';
import type { MacroGraphStore } from '../../core/ports/MacroGraphStore';
import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../../core/types/persistence/graph.persistence';
import { logger } from '../../shared/utils/logger';

/**
 * @description DualWriteGraphStoreProxy 동작 옵션입니다.
 *
 * @property shadowReadCompare true이면 읽기 시 Neo4j 결과와 비교해 불일치를 warn으로 기록합니다.
 * @property secondaryWritesEnabled true이면 Neo4j shadow write를 활성화합니다.
 */
export interface DualWriteOptions {
  /** true이면 읽기 시 Neo4j 결과와 비교해 불일치를 warn으로 기록합니다. */
  shadowReadCompare?: boolean;
  /** true이면 Neo4j shadow write를 활성화합니다. */
  secondaryWritesEnabled?: boolean;
}

/**
 * @description 비교를 위해 배열을 정렬하고 타임스탬프 필드를 제거하는 정규화 함수입니다.
 *
 * false positive(createdAt/updatedAt 차이)를 방지합니다. 배열은 JSON 문자열 기준 안정 정렬합니다.
 *
 * @param val 정규화할 값
 * @returns 정규화된 값
 */
function normalizeForCompare(val: unknown): unknown {
  if (Array.isArray(val)) {
    return [...val.map(normalizeForCompare)].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
  }
  if (val !== null && val !== undefined && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      if (k === 'createdAt' || k === 'updatedAt') continue;
      result[k] = normalizeForCompare(obj[k]);
    }
    return result;
  }
  return val;
}

/**
 * @description 두 객체의 차이를 저장하기 위한 타입 정의
 */
type DiffEntry = {
  path: string;
  id?: string | number;
  primary?: unknown;
  secondary?: unknown;
};

/**
 * @description 객체에서 식별자를 추출하는 함수입니다.
 *
 * @param val 식별자를 추출할 객체
 * @returns 식별자 문자열 또는 숫자, 없으면 undefined
 */
function getComparableId(val: unknown): string | number | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as Record<string, unknown>;
  const id = obj.id ?? obj.origId ?? obj.userId;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

/**
 * @description 비교 결과에 남길 값을 간소화하는 함수입니다.
 *
 * @param val 간소화할 원래 값
 * @returns 로깅용으로 간소화된 값
 */
function compactDiffValue(val: unknown): unknown {
  if (Array.isArray(val)) return `[array:${val.length}]`;
  if (!val || typeof val !== 'object') return val;
  const obj = val as Record<string, unknown>;
  return { id: obj.id, origId: obj.origId, userId: obj.userId, deletedAt: obj.deletedAt };
}

/**
 * @description Primary(Mongo)와 Secondary(Neo4j) 데이터 객체 간의 차이점을 수집합니다.
 *
 * @param primary Mongo에서 조회한 원본 데이터
 * @param secondary Neo4j에서 조회한 대조 데이터
 * @param path 현재 비교 중인 JSON 경로 (기본값: '$')
 * @param diffs 차이점을 누적할 배열
 * @param limit 수집할 최대 차이점 개수 (기본값: 25)
 * @returns 수집된 차이점 배열
 */
function collectDiffs(
  primary: unknown,
  secondary: unknown,
  path = '$',
  diffs: DiffEntry[] = [],
  limit = 25
): DiffEntry[] {
  if (diffs.length >= limit || Object.is(primary, secondary)) return diffs;

  if (Array.isArray(primary) || Array.isArray(secondary)) {
    const pArr = Array.isArray(primary) ? primary : [];
    const sArr = Array.isArray(secondary) ? secondary : [];
    if (pArr.length !== sArr.length) {
      diffs.push({ path: `${path}.length`, primary: pArr.length, secondary: sArr.length });
    }
    for (let i = 0; i < Math.min(Math.max(pArr.length, sArr.length), 50); i += 1) {
      collectDiffs(pArr[i], sArr[i], `${path}[${i}]`, diffs, limit);
      if (diffs.length >= limit) break;
    }
    return diffs;
  }

  if (primary && secondary && typeof primary === 'object' && typeof secondary === 'object') {
    const pObj = primary as Record<string, unknown>;
    const sObj = secondary as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(pObj), ...Object.keys(sObj)])).sort();
    for (const key of keys) {
      collectDiffs(pObj[key], sObj[key], `${path}.${key}`, diffs, limit);
      if (diffs.length >= limit) break;
    }
    return diffs;
  }

  diffs.push({
    path,
    id: getComparableId(primary) ?? getComparableId(secondary),
    primary: compactDiffValue(primary),
    secondary: compactDiffValue(secondary),
  });
  return diffs;
}

/**
 * @description MongoDB primary와 Neo4j secondary에 동일한 비즈니스 요청을 독립적으로 병렬 처리하는 Proxy입니다.
 *
 * **독립적 병렬 처리(Independent Parallel Processing) 원칙**:
 * - 모든 쓰기 작업은 Primary(MongoDB)와 Secondary(Neo4j)에 동일한 입력으로 각각 독립 실행됩니다.
 * - Secondary(Neo4j)는 MongoDB로부터 데이터를 읽어 동기화하지 않습니다.
 * - MongoDB write가 실패하면 기존과 동일하게 예외를 throw합니다.
 * - Neo4j shadow write가 실패해도 FE 요청은 실패시키지 않습니다.
 * - 읽기는 항상 MongoDB primary 결과를 반환하며, shadowReadCompare 옵션으로 Neo4j와 비교합니다.
 */
export class DualWriteGraphStoreProxy implements GraphDocumentStore {
  constructor(
    private readonly primary: GraphDocumentStore,
    private readonly secondary: MacroGraphStore,
    private readonly options: DualWriteOptions = {}
  ) {}

  private get shadowWritesEnabled(): boolean {
    return this.options.secondaryWritesEnabled ?? false;
  }

  private get shadowReadCompareEnabled(): boolean {
    return this.options.shadowReadCompare ?? false;
  }

  /**
   * @description 외부에서 Shadow Sync를 명시적으로 요청할 때 호출하는 메서드입니다.
   *
   * 독립적 병렬 처리 구조에서는 각 쓰기 작업이 이미 Neo4j에 직접 반영되므로,
   * 이 메서드는 하위 호환성을 위해 유지되나 no-op으로 동작합니다.
   */
  async flushShadowSync(_userId: string, _operation = 'afterCommit'): Promise<void> {
    // 독립적 병렬 처리 구조에서는 각 개별 쓰기가 이미 Neo4j에 직접 반영됩니다.
  }

  /**
   * @description Mongo Write 직후 Neo4j에 동일한 단건 작업을 미러링합니다.
   *
   * `mirrorAfterWrite`는 MongoDB 데이터를 읽지 않으며, 호출 측이 전달한 입력을
   * 그대로 Neo4j에 독립적으로 전달합니다.
   *
   * @param userId 사용자 ID
   * @param operation 트리거된 쓰기 오퍼레이션
   * @param options 트랜잭션 정보
   * @param action 실행할 Neo4j 호출 함수
   */
  private async mirrorAfterWrite(
    userId: string,
    operation: string,
    options: RepoOptions | undefined,
    action: () => Promise<void>
  ): Promise<void> {
    if (!this.shadowWritesEnabled) return;

    const run = async () => {
      try {
        await action();
      } catch (err) {
        logger.warn({ userId, operation, err }, 'Neo4j shadow mutation failed');
        Sentry.captureException(err, { extra: { userId, operation } });
      }
    };

    if (options?.afterCommit) {
      options.afterCommit.push(run);
      return;
    }
    if (options?.session) {
      logger.warn(
        { userId, operation },
        'Neo4j shadow mutation skipped inside Mongo transaction without afterCommit hook'
      );
      return;
    }
    await run();
  }

  /**
   * @description Mongo에서 읽어온 Primary 결과를 반환하되, `shadowReadCompare` 옵션이 켜져 있으면
   * 백그라운드에서 Neo4j(Secondary)의 동일 결과를 가져와 불일치를 비교합니다.
   *
   * @param method 호출된 메서드명
   * @param userId 사용자 ID
   * @param primaryResult Mongo에서 조회한 원본 결과
   * @param secondaryFetch Neo4j에서 동일한 결과를 가져오는 함수
   * @returns primaryResult (어떤 경우에도 Mongo 결과가 항상 반환됩니다)
   */
  private async compareAndReturn<T>(
    method: string,
    userId: string,
    primaryResult: T,
    secondaryFetch: () => Promise<T>
  ): Promise<T> {
    if (!this.shadowReadCompareEnabled || !this.shadowWritesEnabled) return primaryResult;
    try {
      const secondaryResult = await secondaryFetch();
      const primaryNorm = JSON.stringify(normalizeForCompare(primaryResult));
      const secondaryNorm = JSON.stringify(normalizeForCompare(secondaryResult));

      if (primaryNorm !== secondaryNorm) {
        const diffs = collectDiffs(
          normalizeForCompare(primaryResult),
          normalizeForCompare(secondaryResult)
        );
        logger.warn(
          {
            userId,
            method,
            diffs,
            primaryLength: primaryNorm.length,
            secondaryLength: secondaryNorm.length,
          },
          'Macro graph dual read mismatch'
        );
      }
    } catch (err) {
      logger.warn({ userId, method, err }, 'Neo4j secondary read failed during comparison');
    }
    return primaryResult;
  }

  // ── Node ─────────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void> {
    await this.primary.upsertNode(node, options);
    await this.mirrorAfterWrite(node.userId, 'upsertNode', options, () =>
      this.secondary.upsertNode(node)
    );
  }

  /** @inheritdoc */
  async upsertNodes(nodes: GraphNodeDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertNodes(nodes, options);
    if (nodes.length > 0) {
      await this.mirrorAfterWrite(nodes[0].userId, 'upsertNodes', options, () =>
        this.secondary.upsertNodes(nodes)
      );
    }
  }

  /** @inheritdoc */
  async updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.updateNode(userId, id, patch, options);
    await this.mirrorAfterWrite(userId, 'updateNode', options, () =>
      this.secondary.updateNode(userId, id, patch)
    );
  }

  /** @inheritdoc */
  async deleteNode(
    userId: string,
    id: number,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteNode(userId, id, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteNode', options, () =>
      this.secondary.deleteNode(userId, id, permanent)
    );
  }

  /** @inheritdoc */
  async deleteNodes(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteNodes(userId, ids, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteNodes', options, () =>
      this.secondary.deleteNodes(userId, ids, permanent)
    );
  }

  /** @inheritdoc */
  async deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteNodesByOrigIds(userId, origIds, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteNodesByOrigIds', options, () =>
      this.secondary.deleteNodesByOrigIds(userId, origIds, permanent)
    );
  }

  /** @inheritdoc */
  async restoreNode(userId: string, id: number, options?: RepoOptions): Promise<void> {
    await this.primary.restoreNode(userId, id, options);
    await this.mirrorAfterWrite(userId, 'restoreNode', options, () =>
      this.secondary.restoreNode(userId, id)
    );
  }

  /** @inheritdoc */
  async restoreNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.restoreNodesByOrigIds(userId, origIds, options);
    await this.mirrorAfterWrite(userId, 'restoreNodesByOrigIds', options, () =>
      this.secondary.restoreNodesByOrigIds(userId, origIds)
    );
  }

  /** @inheritdoc */
  async findNode(userId: string, id: number): Promise<GraphNodeDoc | null> {
    const primary = await this.primary.findNode(userId, id);
    return this.compareAndReturn('findNode', userId, primary, () =>
      this.secondary.findNode(userId, id)
    );
  }

  /** @inheritdoc */
  async findNodesByOrigIds(userId: string, origIds: string[]): Promise<GraphNodeDoc[]> {
    const primary = await this.primary.findNodesByOrigIds(userId, origIds);
    return this.compareAndReturn('findNodesByOrigIds', userId, primary, () =>
      this.secondary.findNodesByOrigIds(userId, origIds)
    );
  }

  /** @inheritdoc */
  async findNodesByOrigIdsAll(userId: string, origIds: string[]): Promise<GraphNodeDoc[]> {
    // secondary는 includeDeleted 조회를 별도 options로 지원합니다.
    // 비교 없이 primary만 반환합니다.
    return this.primary.findNodesByOrigIdsAll(userId, origIds);
  }

  /** @inheritdoc */
  async listNodes(userId: string): Promise<GraphNodeDoc[]> {
    const primary = await this.primary.listNodes(userId);
    return this.compareAndReturn('listNodes', userId, primary, () =>
      this.secondary.listNodes(userId)
    );
  }

  /** @inheritdoc */
  async listNodesAll(userId: string): Promise<GraphNodeDoc[]> {
    return this.primary.listNodesAll(userId);
  }

  /** @inheritdoc */
  async listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]> {
    const primary = await this.primary.listNodesByCluster(userId, clusterId);
    return this.compareAndReturn('listNodesByCluster', userId, primary, () =>
      this.secondary.listNodesByCluster(userId, clusterId)
    );
  }

  /** @inheritdoc */
  async deleteAllGraphData(
    userId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteAllGraphData(userId, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteAllGraphData', options, () =>
      this.secondary.deleteAllGraphData(userId, permanent)
    );
  }

  /** @inheritdoc */
  async restoreAllGraphData(userId: string, options?: RepoOptions): Promise<void> {
    await this.primary.restoreAllGraphData(userId, options);
    await this.mirrorAfterWrite(userId, 'restoreAllGraphData', options, () =>
      this.secondary.restoreAllGraphData(userId)
    );
  }

  // ── Edge ─────────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string> {
    const result = await this.primary.upsertEdge(edge, options);
    await this.mirrorAfterWrite(edge.userId, 'upsertEdge', options, () =>
      this.secondary.upsertEdge(edge).then(() => undefined)
    );
    return result;
  }

  /** @inheritdoc */
  async upsertEdges(edges: GraphEdgeDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertEdges(edges, options);
    if (edges.length > 0) {
      await this.mirrorAfterWrite(edges[0].userId, 'upsertEdges', options, () =>
        this.secondary.upsertEdges(edges)
      );
    }
  }

  /** @inheritdoc */
  async deleteEdge(
    userId: string,
    edgeId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteEdge(userId, edgeId, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteEdge', options, () =>
      this.secondary.deleteEdge(userId, edgeId, permanent)
    );
  }

  /** @inheritdoc */
  async deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteEdgeBetween(userId, source, target, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteEdgeBetween', options, () =>
      this.secondary.deleteEdgeBetween(userId, source, target, permanent)
    );
  }

  /** @inheritdoc */
  async deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteEdgesByNodeIds(userId, ids, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteEdgesByNodeIds', options, () =>
      this.secondary.deleteEdgesByNodeIds(userId, ids, permanent)
    );
  }

  /** @inheritdoc */
  async restoreEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void> {
    await this.primary.restoreEdge(userId, edgeId, options);
    await this.mirrorAfterWrite(userId, 'restoreEdge', options, () =>
      this.secondary.restoreEdge(userId, edgeId)
    );
  }

  /** @inheritdoc */
  async listEdges(userId: string): Promise<GraphEdgeDoc[]> {
    const primary = await this.primary.listEdges(userId);
    return this.compareAndReturn('listEdges', userId, primary, () =>
      this.secondary.listEdges(userId)
    );
  }

  // ── Cluster ───────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void> {
    await this.primary.upsertCluster(cluster, options);
    await this.mirrorAfterWrite(cluster.userId, 'upsertCluster', options, () =>
      this.secondary.upsertCluster(cluster)
    );
  }

  /** @inheritdoc */
  async upsertClusters(clusters: GraphClusterDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertClusters(clusters, options);
    if (clusters.length > 0) {
      await this.mirrorAfterWrite(clusters[0].userId, 'upsertClusters', options, () =>
        this.secondary.upsertClusters(clusters)
      );
    }
  }

  /** @inheritdoc */
  async deleteCluster(
    userId: string,
    clusterId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteCluster(userId, clusterId, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteCluster', options, () =>
      this.secondary.deleteCluster(userId, clusterId, permanent)
    );
  }

  /** @inheritdoc */
  async restoreCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void> {
    await this.primary.restoreCluster(userId, clusterId, options);
    await this.mirrorAfterWrite(userId, 'restoreCluster', options, () =>
      this.secondary.restoreCluster(userId, clusterId)
    );
  }

  /** @inheritdoc */
  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null> {
    const primary = await this.primary.findCluster(userId, clusterId);
    return this.compareAndReturn('findCluster', userId, primary, () =>
      this.secondary.findCluster(userId, clusterId)
    );
  }

  /** @inheritdoc */
  async listClusters(userId: string): Promise<GraphClusterDoc[]> {
    const primary = await this.primary.listClusters(userId);
    return this.compareAndReturn('listClusters', userId, primary, () =>
      this.secondary.listClusters(userId)
    );
  }

  // ── Subcluster ───────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertSubcluster(subcluster: GraphSubclusterDoc, options?: RepoOptions): Promise<void> {
    await this.primary.upsertSubcluster(subcluster, options);
    await this.mirrorAfterWrite(subcluster.userId, 'upsertSubcluster', options, () =>
      this.secondary.upsertSubcluster(subcluster)
    );
  }

  /** @inheritdoc */
  async upsertSubclusters(subclusters: GraphSubclusterDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertSubclusters(subclusters, options);
    if (subclusters.length > 0) {
      await this.mirrorAfterWrite(subclusters[0].userId, 'upsertSubclusters', options, () =>
        this.secondary.upsertSubclusters(subclusters)
      );
    }
  }

  /** @inheritdoc */
  async deleteSubcluster(
    userId: string,
    subclusterId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteSubcluster(userId, subclusterId, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteSubcluster', options, () =>
      this.secondary.deleteSubcluster(userId, subclusterId, permanent)
    );
  }

  /** @inheritdoc */
  async restoreSubcluster(
    userId: string,
    subclusterId: string,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.restoreSubcluster(userId, subclusterId, options);
    await this.mirrorAfterWrite(userId, 'restoreSubcluster', options, () =>
      this.secondary.restoreSubcluster(userId, subclusterId)
    );
  }

  /** @inheritdoc */
  async listSubclusters(userId: string): Promise<GraphSubclusterDoc[]> {
    const primary = await this.primary.listSubclusters(userId);
    return this.compareAndReturn('listSubclusters', userId, primary, () =>
      this.secondary.listSubclusters(userId)
    );
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void> {
    await this.primary.saveStats(stats, options);
    await this.mirrorAfterWrite(stats.userId, 'saveStats', options, () =>
      this.secondary.saveStats(stats)
    );
  }

  /** @inheritdoc */
  async getStats(userId: string): Promise<GraphStatsDoc | null> {
    const primary = await this.primary.getStats(userId);
    return this.compareAndReturn('getStats', userId, primary, () =>
      this.secondary.getStats(userId)
    );
  }

  /** @inheritdoc */
  async deleteStats(userId: string, permanent?: boolean, options?: RepoOptions): Promise<void> {
    await this.primary.deleteStats(userId, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteStats', options, () =>
      this.secondary.deleteStats(userId, permanent)
    );
  }

  // ── Graph Summary ─────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertGraphSummary(
    userId: string,
    summary: GraphSummaryDoc,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.upsertGraphSummary(userId, summary, options);
    await this.mirrorAfterWrite(userId, 'upsertGraphSummary', options, () =>
      this.secondary.upsertGraphSummary(userId, summary)
    );
  }

  /** @inheritdoc */
  async getGraphSummary(userId: string): Promise<GraphSummaryDoc | null> {
    const primary = await this.primary.getGraphSummary(userId);
    return this.compareAndReturn('getGraphSummary', userId, primary, () =>
      this.secondary.getGraphSummary(userId)
    );
  }

  /** @inheritdoc */
  async deleteGraphSummary(
    userId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.deleteGraphSummary(userId, permanent, options);
    await this.mirrorAfterWrite(userId, 'deleteGraphSummary', options, () =>
      this.secondary.deleteGraphSummary(userId)
    );
  }

  /** @inheritdoc */
  async restoreGraphSummary(userId: string, options?: RepoOptions): Promise<void> {
    await this.primary.restoreGraphSummary(userId, options);
    await this.mirrorAfterWrite(userId, 'restoreGraphSummary', options, () =>
      this.secondary.restoreGraphSummary(userId)
    );
  }
}
