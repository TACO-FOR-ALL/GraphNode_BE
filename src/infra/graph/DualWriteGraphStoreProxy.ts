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
import { notifyMacroGraphConsistencyMismatch } from '../../shared/utils/discord';
import { captureMacroGraphConsistencyMismatch } from '../../shared/utils/sentry';
import {
  buildMacroGraphDiffSignature,
  compareMacroGraphResults,
  type MacroGraphDiffEntry,
} from './macroGraphConsistency';

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
  private readonly mismatchAlertCooldownMs = 10 * 60 * 1000;
  private readonly mismatchAlertDedupe = new Map<
    string,
    { lastSentAt: number; suppressed: number }
  >();

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
   * @param action 실행할 Neo4j 호출 함수입니다. 반환값이 있는 adapter 메서드도 shadow write에서는
   * 예외 여부만 관찰하므로 `unknown`으로 허용합니다.
   */
  private async mirrorAfterWrite(
    userId: string,
    operation: string,
    options: RepoOptions | undefined,
    action: () => Promise<unknown>
  ): Promise<void> {
    // dual-write가 꺼진 환경에서는 Mongo primary만 사용하여 기존 단위 테스트/로컬 개발 경로를 유지합니다.
    if (!this.shadowWritesEnabled) return;

    const run = async () => {
      try {
        // Neo4j write는 best-effort입니다. 실패해도 Mongo 작업의 성공 응답은 되돌리지 않습니다.
        await action();
      } catch (err) {
        logger.warn({ userId, operation, err }, 'Neo4j shadow mutation failed');
        Sentry.captureException(err, { extra: { userId, operation } });
      }
    };

    if (options?.afterCommit) {
      // Mongo transaction이 제공한 afterCommit hook이 있으면 커밋 성공 이후에만 Neo4j를 갱신합니다.
      options.afterCommit.push(run);
      return;
    }
    if (options?.session) {
      // Mongo session만 있고 commit hook이 없으면 rollback 가능성을 알 수 없어 secondary write를 의도적으로 보류합니다.
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
  /**
   * @description MongoDB primary read 결과를 즉시 반환하면서, 옵션이 켜진 경우 Neo4j shadow read 비교를
   * 백그라운드에서 시작합니다.
   *
   * 읽기 API의 응답 source는 migration 기간 동안 항상 MongoDB입니다. Neo4j 조회, 비교, 알림 전송은
   * 사용자 응답을 지연시키거나 실패시키면 안 되므로 `void` fire-and-forget으로 분리합니다.
   *
   * @param method 호출된 read method 이름입니다. 비교 규칙 선택과 알림 fingerprint에 사용합니다.
   * @param userId 조회 대상 사용자 ID입니다.
   * @param primaryResult MongoDB에서 이미 조회한 응답 값입니다.
   * @param secondaryFetch 동일 조건으로 Neo4j를 조회하는 함수입니다.
   * @returns 항상 `primaryResult`를 그대로 반환합니다.
   * @throws 이 메서드는 shadow compare 예외를 전파하지 않습니다.
   */
  private compareAndReturn<T>(
    method: string,
    userId: string,
    primaryResult: T,
    secondaryFetch: () => Promise<T>
  ): T {
    // shadow compare가 꺼진 환경에서는 추가 조회 없이 Mongo 결과만 반환합니다.
    if (!this.shadowReadCompareEnabled) return primaryResult;

    // Neo4j 조회와 알림은 API latency/error boundary에서 분리합니다.
    void this.runShadowReadCompare(method, userId, primaryResult, secondaryFetch);
    return primaryResult;
  }

  /**
   * @description Neo4j secondary read를 실행하고 MongoDB primary 결과와 비교합니다.
   *
   * 비교 실패는 migration 관측 이벤트일 뿐 API 실패가 아니므로 warn 로그와 알림으로만 처리합니다.
   * Neo4j 조회 실패도 동일하게 격리하여 Mongo read 응답에는 영향을 주지 않습니다.
   *
   * @param method 호출된 read method 이름입니다.
   * @param userId 조회 대상 사용자 ID입니다.
   * @param primaryResult MongoDB primary에서 반환된 기준 결과입니다.
   * @param secondaryFetch Neo4j secondary 조회 함수입니다.
   * @returns 비교와 필요 시 알림 전송을 마치면 resolve되는 Promise입니다.
   * @throws 내부에서 모든 예외를 catch하여 로그로 남기므로 호출자에게 전파하지 않습니다.
   */
  private async runShadowReadCompare<T>(
    method: string,
    userId: string,
    primaryResult: T,
    secondaryFetch: () => Promise<T>
  ): Promise<void> {
    try {
      const secondaryResult = await secondaryFetch();
      const comparison = compareMacroGraphResults(method, primaryResult, secondaryResult);

      // 불일치가 확인된 경우에만 상세 diff를 로그/알림으로 보냅니다.
      if (!comparison.matched) {
        logger.warn(
          {
            userId,
            method,
            diffs: comparison.diffs,
          },
          'Macro graph dual read mismatch'
        );
        await this.reportMismatch(userId, method, comparison.diffs);
      }
    } catch (err) {
      // secondary read 자체가 실패해도 Mongo primary 응답은 이미 반환되었거나 반환될 예정입니다.
      logger.warn({ userId, method, err }, 'Neo4j secondary read failed during comparison');
    }
  }

  /**
   * @description Macro Graph shadow read 불일치를 Sentry와 Discord로 보고합니다.
   *
   * 동일한 mismatch가 짧은 시간 안에 반복될 수 있으므로 diff signature 기반 cooldown을 적용합니다.
   * Sentry event id는 Discord payload에 연결되어 CloudWatch 로그, Discord, Sentry를 함께 추적할 수 있습니다.
   *
   * @param userId 불일치가 발생한 사용자 ID입니다.
   * @param method 불일치가 발생한 read method 이름입니다.
   * @param diffs 비교 모듈이 생성한 상세 diff 목록입니다.
   * @returns 알림 전송 시도가 끝나면 resolve되는 Promise입니다.
   * @throws Discord 전송 실패는 내부 catch로 warn 처리하며 외부로 전파하지 않습니다.
   */
  private async reportMismatch(
    userId: string,
    method: string,
    diffs: readonly MacroGraphDiffEntry[]
  ): Promise<void> {
    const dedupeKey = `${userId}:${buildMacroGraphDiffSignature(method, diffs)}`;
    const now = Date.now();
    const previous = this.mismatchAlertDedupe.get(dedupeKey);

    // 같은 mismatch가 cooldown 안에 반복되면 알림 대신 suppressed count만 누적합니다.
    if (previous && now - previous.lastSentAt < this.mismatchAlertCooldownMs) {
      previous.suppressed += 1;
      return;
    }

    // cooldown이 지난 첫 이벤트에는 직전 구간의 suppressed count를 함께 보내 운영자가 반복성을 볼 수 있게 합니다.
    const suppressedCount = previous?.suppressed ?? 0;
    this.mismatchAlertDedupe.set(dedupeKey, { lastSentAt: now, suppressed: 0 });
    this.pruneMismatchDedupe();

    // Sentry issue를 먼저 생성하고 event id를 Discord embed에 연결합니다.
    const sentryEventId = captureMacroGraphConsistencyMismatch({
      userId,
      method,
      diffCount: diffs.length,
      diffs,
      suppressedCount,
    });

    // Discord 전송 실패는 관측 실패일 뿐 API/worker 실패로 격상하지 않습니다.
    await notifyMacroGraphConsistencyMismatch({
      userId,
      method,
      diffCount: diffs.length,
      diffs: diffs.slice(0, 10),
      suppressedCount,
      sentryEventId,
    }).catch((err) => {
      logger.warn({ userId, method, err }, 'Discord macro graph mismatch notification failed');
    });
  }

  /**
   * @description mismatch dedupe map이 과도하게 커지는 것을 막기 위해 오래된 key를 정리합니다.
   *
   * 운영 중 많은 사용자/필드에서 일시적으로 불일치가 발생할 수 있으므로, map 크기가 임계치를 넘었을 때만
   * cooldown보다 오래된 항목을 제거합니다.
   *
   * @returns 정리 작업을 마치고 void를 반환합니다.
   * @throws 메모리 map 순회만 수행하므로 예외를 의도적으로 던지지 않습니다.
   */
  private pruneMismatchDedupe(): void {
    if (this.mismatchAlertDedupe.size <= 500) return;
    const cutoff = Date.now() - this.mismatchAlertCooldownMs;
    for (const [key, value] of this.mismatchAlertDedupe.entries()) {
      if (value.lastSentAt < cutoff) this.mismatchAlertDedupe.delete(key);
      if (this.mismatchAlertDedupe.size <= 500) break;
    }
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
    const primary = await this.primary.findNodesByOrigIdsAll(userId, origIds);
    return this.compareAndReturn('findNodesByOrigIdsAll', userId, primary, () =>
      this.secondary.findNodesByOrigIds(userId, origIds, { includeDeleted: true })
    );
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
    const primary = await this.primary.listNodesAll(userId);
    return this.compareAndReturn('listNodesAll', userId, primary, () =>
      this.secondary.listNodesAll(userId, { includeDeleted: true })
    );
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
      this.secondary.upsertEdge(edge)
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
