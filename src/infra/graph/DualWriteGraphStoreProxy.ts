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
  // 1. 값이 배열인 경우, 내부 요소를 재귀적으로 정규화한 후 JSON 문자열 기준으로 정렬합니다.
  if (Array.isArray(val)) {
    return [...val.map(normalizeForCompare)].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
  }
  // 2. 값이 객체인 경우 (null 제외)
  if (val !== null && val !== undefined && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    // 객체의 키를 알파벳 순으로 정렬하여 순서 불일치로 인한 오차를 방지합니다.
    for (const k of Object.keys(obj).sort()) {
      // 타임스탬프(createdAt, updatedAt)는 비교 대상에서 제외합니다.
      if (k === 'createdAt' || k === 'updatedAt') continue;
      result[k] = normalizeForCompare(obj[k]);
    }
    return result;
  }
  // 3. 원시 타입(primitive)인 경우 그대로 반환합니다.
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
 * @description 객체에서 식별자(id, origId, userId 등)를 추출하여 반환하는 함수입니다.
 * 비교 결과(diff)를 남길 때 어떤 문서에서 차이가 발생했는지 식별하기 위해 사용됩니다.
 *
 * @param val 식별자를 추출할 객체
 * @returns 식별자 문자열 또는 숫자, 없으면 undefined
 */
function getComparableId(val: unknown): string | number | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as Record<string, unknown>;
  // id, origId, userId 순으로 우선순위를 두어 식별자를 찾습니다.
  const id = obj.id ?? obj.origId ?? obj.userId;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

/**
 * @description 비교 결과에 남길 값을 간소화(압축)하는 함수입니다.
 * 거대한 배열이나 깊은 객체가 그대로 로그에 남는 것을 방지합니다.
 *
 * @param val 간소화할 원래 값
 * @returns 로깅용으로 간소화된 값
 */
function compactDiffValue(val: unknown): unknown {
  // 배열인 경우 크기 정보만 남깁니다.
  if (Array.isArray(val)) return `[array:${val.length}]`;
  // 원시 타입인 경우 그대로 반환합니다.
  if (!val || typeof val !== 'object') return val;
  // 객체인 경우 식별 및 상태 정보(id, 삭제 여부 등)만 추출합니다.
  const obj = val as Record<string, unknown>;
  return {
    id: obj.id,
    origId: obj.origId,
    userId: obj.userId,
    deletedAt: obj.deletedAt,
  };
}

/**
 * @description Primary(Mongo)와 Secondary(Neo4j) 데이터 객체 간의 차이점을 수집합니다.
 * 재귀적으로 속성을 탐색하며 불일치하는 항목들을 diffs 배열에 담아 반환합니다.
 *
 * @param primary Mongo에서 조회한 원본 데이터
 * @param secondary Neo4j에서 조회한 대조 데이터
 * @param path 현재 비교 중인 JSON 경로 (기본값: '$')
 * @param diffs 차이점을 누적할 배열
 * @param limit 수집할 최대 차이점 개수 (기본값: 25, 너무 많은 로그 방지)
 * @returns 수집된 차이점 배열
 */
function collectDiffs(
  primary: unknown,
  secondary: unknown,
  path = '$',
  diffs: DiffEntry[] = [],
  limit = 25
): DiffEntry[] {
  // 최대 한계치에 도달했거나 두 값이 완전히 동일하다면 바로 반환합니다.
  if (diffs.length >= limit || Object.is(primary, secondary)) return diffs;

  // 1. 둘 중 하나라도 배열인 경우
  if (Array.isArray(primary) || Array.isArray(secondary)) {
    const pArr = Array.isArray(primary) ? primary : [];
    const sArr = Array.isArray(secondary) ? secondary : [];
    // 배열 길이가 다르면 차이점으로 기록합니다.
    if (pArr.length !== sArr.length) {
      diffs.push({ path: `${path}.length`, primary: pArr.length, secondary: sArr.length });
    }
    // 최대 50개의 원소까지만 하위 비교를 수행합니다.
    for (let i = 0; i < Math.min(Math.max(pArr.length, sArr.length), 50); i += 1) {
      collectDiffs(pArr[i], sArr[i], `${path}[${i}]`, diffs, limit);
      if (diffs.length >= limit) break; // 한도 초과 시 조기 종료
    }
    return diffs;
  }

  // 2. 둘 다 객체인 경우
  if (primary && secondary && typeof primary === 'object' && typeof secondary === 'object') {
    const pObj = primary as Record<string, unknown>;
    const sObj = secondary as Record<string, unknown>;
    // 두 객체의 모든 키를 모아 중복을 제거하고 정렬합니다.
    const keys = Array.from(new Set([...Object.keys(pObj), ...Object.keys(sObj)])).sort();
    for (const key of keys) {
      // 속성별로 재귀 호출하여 비교합니다.
      collectDiffs(pObj[key], sObj[key], `${path}.${key}`, diffs, limit);
      if (diffs.length >= limit) break; // 한도 초과 시 조기 종료
    }
    return diffs;
  }

  // 3. 원시 타입의 값이 서로 다르거나, 타입이 불일치하는 경우
  // 현재 path와 식별자(id) 정보와 함께, 간소화된 값으로 diff에 추가합니다.
  diffs.push({
    path,
    id: getComparableId(primary) ?? getComparableId(secondary),
    primary: compactDiffValue(primary),
    secondary: compactDiffValue(secondary),
  });
  return diffs;
}

/**
 * @description MongoDB primary 결과를 기준으로 반환하고 Neo4j secondary shadow write를 수행하는 Proxy입니다.
 *
 * - 모든 반환값은 MongoDB primary 결과를 사용합니다.
 * - MongoDB write가 실패하면 기존과 동일하게 예외를 throw합니다.
 * - Neo4j shadow write가 실패해도 FE 요청은 실패시키지 않습니다.
 * - Neo4j와 MongoDB는 cross-DB transaction이 불가능하므로 rollback을 시도하지 않습니다.
 * - write 작업마다 개별 Neo4j 단건 쓰기가 아닌 syncFullGraphFromMongo(userId)로 현재 Mongo 상태 전체를 반영합니다.
 */
export class DualWriteGraphStoreProxy implements GraphDocumentStore {
  private readonly syncQueues = new Map<string, Promise<void>>();

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
   * @description Mongo primary에서 전체 graph 상태를 읽어 Neo4j secondary에 upsert 합니다.
   * Dual Write 중 개별 쓰기가 아닌, 현재 Mongo의 스냅샷을 통째로 덮어쓰는 동기화 작업입니다.
   * stats가 없으면 sync를 건너뜁니다. 실패해도 예외를 외부로 전파하지 않습니다.
   *
   * @param userId 동기화 대상 사용자 ID
   * @param operation 동기화를 트리거한 오퍼레이션 이름 (로깅용)
   */
  async syncFullGraphFromMongo(userId: string, operation = 'syncFullGraphFromMongo'): Promise<void> {
    // 섀도우 쓰기가 비활성화된 경우 아무 작업도 하지 않습니다.
    if (!this.shadowWritesEnabled) return;
    try {
      // 1. Mongo(Primary)로부터 사용자의 전체 그래프 데이터를 병렬로 가져옵니다.
      const [nodes, edges, clusters, subclusters, stats, summary] = await Promise.all([
        this.primary.listNodes(userId),
        this.primary.listEdges(userId),
        this.primary.listClusters(userId),
        this.primary.listSubclusters(userId),
        this.primary.getStats(userId),
        this.primary.getGraphSummary(userId),
      ]);

      // 2. 만약 stats(통계) 문서조차 없다면, 유효한 그래프 데이터가 없다고 간주하고 종료합니다.
      if (stats === null) {
        logger.info({ userId }, 'Skipping Neo4j sync: no stats found in primary');
        return;
      }

      // 3. 수집된 전체 데이터를 Neo4j(Secondary)에 일괄 저장(upsert)합니다.
      await this.secondary.upsertGraph({
        userId,
        nodes,
        edges,
        clusters,
        subclusters,
        stats,
        summary: summary ?? undefined,
      });
    } catch (err) {
      // 동기화 중 에러가 발생해도 메인 비즈니스 로직(Mongo)을 방해하지 않도록, 로그만 남깁니다.
      logger.warn({ userId, operation, err }, 'Macro graph Neo4j shadow sync failed (migration divergence)');
      Sentry.captureException(err, { extra: { userId, operation } });
    }
  }

  /**
   * @description write 이후 fire-and-forget 방식으로 Neo4j full sync를 큐에 넣어 수행합니다.
   * 동일 유저에 대한 동시 동기화 요청이 발생할 경우 순차적으로 처리되도록 Promise 체인(syncQueues)을 사용합니다.
   *
   * @param userId 동기화 대상 사용자 ID
   * @param operation 동기화를 트리거한 오퍼레이션 이름
   */
  private async enqueueFullSync(userId: string, operation: string): Promise<void> {
    if (!this.shadowWritesEnabled) return;
    
    // 이전에 대기 중인 동기화 작업이 있는지 확인합니다.
    const previous = this.syncQueues.get(userId) ?? Promise.resolve();
    
    // 이전 작업이 끝난 후(성공하든 실패하든 catch) 현재의 전체 동기화 작업을 체이닝합니다.
    const next = previous
      .catch(() => undefined)
      .then(() => this.syncFullGraphFromMongo(userId, operation));
      
    // 큐 맵에 갱신된 Promise 체인을 저장합니다.
    this.syncQueues.set(
      userId,
      next.finally(() => {
        // 작업 완료 후, 현재 큐에 대기 중인 다른 작업이 없다면 큐에서 제거(정리)합니다.
        if (this.syncQueues.get(userId) === next) {
          this.syncQueues.delete(userId);
        }
      })
    );
    await next;
  }

  /**
   * @description 외부(서비스 계층 등)에서 명시적으로 Shadow Sync를 발생시키고 싶을 때 호출하는 메서드입니다.
   */
  async flushShadowSync(userId: string, operation = 'afterCommit'): Promise<void> {
    await this.enqueueFullSync(userId, operation);
  }

  /**
   * @description Mongo Write 작업 직후에 Neo4j 동기화를 트리거하는 유틸리티입니다.
   * 트랜잭션 옵션(`afterCommit`)이 있다면 트랜잭션이 성공한 후에 실행되도록 예약하고,
   * 트랜잭션 없이 단독 실행되었다면 즉시 실행합니다.
   * 
   * @param userId 사용자 ID
   * @param operation 트리거된 쓰기 오퍼레이션
   * @param options 트랜잭션 정보(afterCommit 포함)
   */
  private async syncAfterWrite(
    userId: string,
    operation: string,
    options?: RepoOptions
  ): Promise<void> {
    if (!this.shadowWritesEnabled) return;
    
    // 실행할 동기화 함수 (전체 동기화)
    const run = () => this.enqueueFullSync(userId, operation);
    
    // 1. 트랜잭션 afterCommit 배열이 존재하면 콜백으로 등록합니다.
    if (options?.afterCommit) {
      options.afterCommit.push(run);
      return;
    }
    // 2. afterCommit이 없는데 session만 있다면 트랜잭션 도중(Commit 전)에 
    // 외부 DB 동기화를 하려는 위험한 상태이므로 경고를 띄우고 무시합니다.
    if (options?.session) {
      logger.warn(
        { userId, operation },
        'Neo4j shadow sync skipped inside Mongo transaction without afterCommit hook'
      );
      return;
    }
    // 3. 트랜잭션이 아닌 단일 작업일 경우 즉시 동기화를 실행합니다.
    await run();
  }

  /**
   * @description 전체 상태 동기화(syncFullGraphFromMongo) 대신,
   * 단건 작업(예: 삭제)에 대해 Neo4j에서도 동일한 단건 작업을 거울처럼 수행(Mirroring)하게 합니다.
   * 
   * @param userId 사용자 ID
   * @param operation 트리거된 쓰기 오퍼레이션
   * @param options 트랜잭션 정보
   * @param action 실행할 단건 Neo4j 호출 함수
   */
  private async mirrorAfterWrite(
    userId: string,
    operation: string,
    options: RepoOptions | undefined,
    action: () => Promise<void>
  ): Promise<void> {
    if (!this.shadowWritesEnabled) return;
    
    // 래퍼: Neo4j 액션을 실행하되 실패해도 메인 로직에 영향이 없도록 에러를 캐치합니다.
    const run = async () => {
      try {
        await action();
      } catch (err) {
        logger.warn({ userId, operation, err }, 'Neo4j shadow mutation failed');
        Sentry.captureException(err, { extra: { userId, operation } });
      }
    };
    
    // 트랜잭션 Commit 성공 후 실행하도록 콜백에 담습니다.
    if (options?.afterCommit) {
      options.afterCommit.push(run);
      return;
    }
    // 부적절한 트랜잭션 내부 호출 방어 로직
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
   * 백그라운드에서 Neo4j(Secondary)의 동일 결과를 가져와 둘 사이의 불일치를 비교합니다.
   * 비교 불일치 시 throw(에러 발생)하지 않고 logger.warn으로 상세 Diff를 기록합니다.
   *
   * @param method 호출된 메서드명 (예: 'listNodes')
   * @param userId 사용자 ID
   * @param primaryResult Mongo에서 조회한 원본 결과
   * @param secondaryFetch Neo4j에서 동일한 결과를 가져오는 함수(콜백)
   * @returns primaryResult (어떤 경우에도 Mongo 결과가 항상 반환됩니다)
   */
  private async compareAndReturn<T>(
    method: string,
    userId: string,
    primaryResult: T,
    secondaryFetch: () => Promise<T>
  ): Promise<T> {
    // 섀도우 리드 비교나 섀도우 쓰기가 꺼져있으면 대조하지 않고 즉시 원본을 반환합니다.
    if (!this.shadowReadCompareEnabled || !this.shadowWritesEnabled) return primaryResult;
    try {
      // 1. Neo4j에서 대조용 결과를 가져옵니다.
      const secondaryResult = await secondaryFetch();
      
      // 2. 두 결과를 정규화(날짜, 배열 순서 등 무시)한 뒤 직렬화하여 단순 비교합니다.
      const primaryNorm = JSON.stringify(normalizeForCompare(primaryResult));
      const secondaryNorm = JSON.stringify(normalizeForCompare(secondaryResult));
      
      // 3. 직렬화된 문자열이 다르다면 데이터 불일치가 발생한 것입니다.
      if (primaryNorm !== secondaryNorm) {
        // 상세한 Diff(차이점)를 수집합니다.
        const diffs = collectDiffs(
          normalizeForCompare(primaryResult),
          normalizeForCompare(secondaryResult)
        );
        
        // 차이점을 로깅하여 추후 아키텍처 점검 시 사용할 수 있도록 합니다.
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
      // 비교 과정(Neo4j 쿼리 등)에서 실패해도 원본 결과 반환에 영향을 주지 않아야 합니다.
      logger.warn({ userId, method, err }, 'Neo4j secondary read failed during comparison');
    }
    
    // 성공/실패 여부와 무관하게 항상 무사히 Primary 결과를 반환합니다.
    return primaryResult;
  }

  // ── Node ─────────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void> {
    await this.primary.upsertNode(node, options);
    await this.syncAfterWrite(node.userId, 'upsertNode', options);
  }

  /** @inheritdoc */
  async upsertNodes(nodes: GraphNodeDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertNodes(nodes, options);
    if (nodes.length > 0) await this.syncAfterWrite(nodes[0].userId, 'upsertNodes', options);
  }

  /** @inheritdoc */
  async updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void> {
    await this.primary.updateNode(userId, id, patch, options);
    await this.syncAfterWrite(userId, 'updateNode', options);
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
    // secondary는 soft-delete 포함 조회를 지원하지 않으므로 비교 없이 primary만 반환합니다.
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
      this.secondary.deleteGraph(userId)
    );
  }

  /** @inheritdoc */
  async restoreAllGraphData(userId: string, options?: RepoOptions): Promise<void> {
    await this.primary.restoreAllGraphData(userId, options);
    await this.syncAfterWrite(userId, 'restoreAllGraphData', options);
  }

  // ── Edge ─────────────────────────────────────────────────────────────────

  /** @inheritdoc */
  async upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string> {
    const result = await this.primary.upsertEdge(edge, options);
    await this.syncAfterWrite(edge.userId, 'upsertEdge', options);
    return result;
  }

  /** @inheritdoc */
  async upsertEdges(edges: GraphEdgeDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertEdges(edges, options);
    if (edges.length > 0) await this.syncAfterWrite(edges[0].userId, 'upsertEdges', options);
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
    await this.syncAfterWrite(cluster.userId, 'upsertCluster', options);
  }

  /** @inheritdoc */
  async upsertClusters(clusters: GraphClusterDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertClusters(clusters, options);
    if (clusters.length > 0) await this.syncAfterWrite(clusters[0].userId, 'upsertClusters', options);
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
    await this.syncAfterWrite(subcluster.userId, 'upsertSubcluster', options);
  }

  /** @inheritdoc */
  async upsertSubclusters(subclusters: GraphSubclusterDoc[], options?: RepoOptions): Promise<void> {
    await this.primary.upsertSubclusters(subclusters, options);
    if (subclusters.length > 0) {
      await this.syncAfterWrite(subclusters[0].userId, 'upsertSubclusters', options);
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
    await this.syncAfterWrite(stats.userId, 'saveStats', options);
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
    await this.syncAfterWrite(userId, 'upsertGraphSummary', options);
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
    await this.syncAfterWrite(userId, 'restoreGraphSummary', options);
  }
}
