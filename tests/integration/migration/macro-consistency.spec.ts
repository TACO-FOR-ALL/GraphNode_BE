/**
 * @group integration
 * @group migration
 *
 * Macro Graph Migration: MongoDB ↔ Neo4j Read Consistency
 *
 * Verifies that every read method on GraphManagementService returns
 * bit-for-bit identical DTOs whether backed by MongoDB or Neo4j.
 * This suite belongs to the dual-write Phase 1 period.
 *
 * Lifecycle:
 *   - Phase 1 (now):  run as-is to catch divergence during dual-write.
 *   - Post-migration: delete this file or strip the Mongo side and
 *     keep as a Neo4j-only regression suite.
 */

// Override the global MongoDB mock set in tests/jest.setup.ts so this
// test file reaches the real driver.  jest.unmock is hoisted by ts-jest
// to run before any import that would pull in the mock factory.
jest.unmock('../../../src/infra/db/mongodb');

// Neo4j credentials are not in jest.setup.ts (only unit-test dummies live
// there).  Provide safe local defaults so src/config/env.ts Zod schema
// passes without requiring infisical in CI.
process.env.NEO4J_URI = process.env.NEO4J_URI ?? 'neo4j://localhost:7687';
process.env.NEO4J_USERNAME = process.env.NEO4J_USERNAME ?? 'neo4j';
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'password';
// Disable shadow-compare inside DualWriteGraphStoreProxy so the proxy
// does not interfere while we compare adapters directly in this suite.
process.env.MACRO_GRAPH_SHADOW_COMPARE_ENABLED = 'false';
process.env.MACRO_GRAPH_DUAL_WRITE_ENABLED =
  process.env.MACRO_GRAPH_DUAL_WRITE_ENABLED ?? 'true';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { initMongo, disconnectMongo } from '../../../src/infra/db/mongodb';
import { initNeo4j, closeNeo4j } from '../../../src/infra/db/neo4j';
import { GraphRepositoryMongo } from '../../../src/infra/repositories/GraphRepositoryMongo';
import { Neo4jMacroGraphAdapter } from '../../../src/infra/graph/Neo4jMacroGraphAdapter';
import { GraphManagementService } from '../../../src/core/services/GraphManagementService';

// ─── Configuration ────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGODB_URL ?? 'mongodb://localhost:27017';

/**
 * The userId whose data must exist in both stores before this suite runs.
 * Populate via the shared seed script or a dedicated migration fixture.
 */
const TEST_USER_ID = process.env.MIGRATION_TEST_USER_ID ?? 'migration-test-user';

// ─── deepCompare utilities ────────────────────────────────────────────────────

export interface DiffEntry {
  path: string;
  mongo: unknown;
  neo4j: unknown;
  reason: string;
}

/**
 * Recursively walks two values and appends every divergence to `diffs`.
 * Stops collecting once `maxDiffs` entries have been accumulated to keep
 * output readable.  Floating-point numbers are compared with 1e-9 tolerance.
 */
export function collectDiffs(
  mongo: unknown,
  neo4j: unknown,
  path: string,
  diffs: DiffEntry[],
  maxDiffs = 25,
): void {
  if (diffs.length >= maxDiffs) return;

  // null / undefined
  if (mongo == null || neo4j == null) {
    if (mongo !== neo4j) {
      diffs.push({ path, mongo, neo4j, reason: 'null/undefined mismatch' });
    }
    return;
  }

  const mongoType = typeof mongo;
  const neo4jType = typeof neo4j;

  if (mongoType !== neo4jType) {
    diffs.push({ path, mongo, neo4j, reason: `type mismatch: ${mongoType} vs ${neo4jType}` });
    return;
  }

  if (Array.isArray(mongo)) {
    if (!Array.isArray(neo4j)) {
      diffs.push({ path, mongo, neo4j, reason: 'mongo is Array but neo4j is not' });
      return;
    }
    if (mongo.length !== (neo4j as unknown[]).length) {
      diffs.push({
        path,
        mongo: `[length:${mongo.length}]`,
        neo4j: `[length:${(neo4j as unknown[]).length}]`,
        reason: 'array length mismatch',
      });
      return;
    }
    for (let i = 0; i < mongo.length; i++) {
      collectDiffs(mongo[i], (neo4j as unknown[])[i], `${path}[${i}]`, diffs, maxDiffs);
    }
    return;
  }

  if (mongoType === 'object') {
    const mo = mongo as Record<string, unknown>;
    const no = neo4j as Record<string, unknown>;
    for (const key of Object.keys(mo)) {
      collectDiffs(mo[key], no[key], `${path}.${key}`, diffs, maxDiffs);
    }
    // neo4j 결과에만 존재하는 extra key도 divergence로 기록합니다.
    if (diffs.length < maxDiffs) {
      for (const key of Object.keys(no)) {
        if (!(key in mo)) {
          diffs.push({
            path: `${path}.${key}`,
            mongo: undefined,
            neo4j: no[key],
            reason: 'extra key in neo4j result',
          });
          if (diffs.length >= maxDiffs) break;
        }
      }
    }
    return;
  }

  if (mongoType === 'number') {
    if (Math.abs((mongo as number) - (neo4j as number)) > 1e-9) {
      diffs.push({ path, mongo, neo4j, reason: 'number value mismatch' });
    }
    return;
  }

  if (mongo !== neo4j) {
    diffs.push({ path, mongo, neo4j, reason: 'value mismatch' });
  }
}

/**
 * Throws an assertion error listing all diffs if the array is non-empty.
 */
export function assertNoDiffs(diffs: DiffEntry[], label: string): void {
  if (diffs.length === 0) return;
  const lines = diffs
    .map(
      (d) =>
        `  ${d.path}: ${d.reason}` +
        ` (mongo=${JSON.stringify(d.mongo)}, neo4j=${JSON.stringify(d.neo4j)})`,
    )
    .join('\n');
  throw new Error(`[${label}] ${diffs.length} diff(s):\n${lines}`);
}

/**
 * Compares two item lists by the `id` field, then checks the given fields on
 * each matched pair.  Order of the input arrays is irrelevant.
 */
export function compareById<T extends { id: string | number }>(
  mongoItems: T[],
  neo4jItems: T[],
  label: string,
  fields: ReadonlyArray<keyof T>,
): void {
  expect(neo4jItems.length).toBe(mongoItems.length);

  const neo4jMap = new Map<string | number, T>(neo4jItems.map((item) => [item.id, item]));

  for (const mItem of mongoItems) {
    const nItem = neo4jMap.get(mItem.id);
    expect(nItem).toBeDefined();
    if (!nItem) continue;

    const diffs: DiffEntry[] = [];
    for (const field of fields) {
      collectDiffs(
        mItem[field],
        nItem[field],
        `${label}[id=${mItem.id}].${String(field)}`,
        diffs,
      );
    }
    assertNoDiffs(diffs, `${label}[id=${mItem.id}]`);
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Macro Graph Migration: MongoDB ↔ Neo4j Read Consistency', () => {
  let mongoService: GraphManagementService;
  // Neo4j adapter implements MacroGraphStore, not GraphDocumentStore.
  // The cast is intentional: we exploit the overlapping read interface to
  // drive GraphManagementService against Neo4j for comparison only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let neo4jService: GraphManagementService;
  const userId = TEST_USER_ID;

  beforeAll(async () => {
    await initMongo(MONGO_URI);
    await initNeo4j();

    const mongoRepo = new GraphRepositoryMongo();
    const neo4jRepo = new Neo4jMacroGraphAdapter();

    mongoService = new GraphManagementService(mongoRepo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neo4jService = new GraphManagementService(neo4jRepo as any);
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo();
    await closeNeo4j();
  });

  // ── listNodes ──────────────────────────────────────────────────────────────

  describe('listNodes — active nodes only', () => {
    it('count must match and per-node scalar fields must be identical', async () => {
      const mongoNodes = await mongoService.listNodes(userId);
      const neo4jNodes = await neo4jService.listNodes(userId);

      expect(mongoNodes.length).toBeGreaterThan(0);

      // id must arrive as JS number, not Neo4j Integer / string
      for (const node of neo4jNodes) {
        expect(typeof node.id).toBe('number');
      }

      compareById(mongoNodes, neo4jNodes, 'listNodes', [
        'id',
        'origId',
        'clusterId',
        'clusterName',
        'numMessages',
        'sourceType',
      ] as const);
    });
  });

  // ── listNodesAll ───────────────────────────────────────────────────────────

  describe('listNodesAll — including soft-deleted nodes', () => {
    it('deletedAt type and value must be consistent', async () => {
      const mongoAll = await mongoService.listNodesAll(userId);
      const neo4jAll = await neo4jService.listNodesAll(userId);

      expect(neo4jAll.length).toBe(mongoAll.length);

      const neo4jMap = new Map(neo4jAll.map((n) => [n.id, n]));

      for (const mNode of mongoAll) {
        const nNode = neo4jMap.get(mNode.id);
        expect(nNode).toBeDefined();
        if (!nNode) continue;

        // Both null or both a Unix-epoch number — no string/number type slip
        expect(nNode.deletedAt == null).toBe(mNode.deletedAt == null);
        if (mNode.deletedAt != null) {
          expect(typeof nNode.deletedAt).toBe('number');
          expect(nNode.deletedAt).toBe(mNode.deletedAt);
        }

        expect(nNode.origId).toBe(mNode.origId);
        expect(nNode.clusterId).toBe(mNode.clusterId);
      }
    });
  });

  // ── findNode ───────────────────────────────────────────────────────────────

  describe('findNode — single node by id', () => {
    it('all scalar fields must match exactly', async () => {
      const mongoNodes = await mongoService.listNodes(userId);
      if (mongoNodes.length === 0) return;

      const targetId = mongoNodes[0].id;
      const mongoNode = await mongoService.findNode(userId, targetId);
      const neo4jNode = await neo4jService.findNode(userId, targetId);

      expect(mongoNode).not.toBeNull();
      expect(neo4jNode).not.toBeNull();
      if (!mongoNode || !neo4jNode) return;

      expect(typeof neo4jNode.id).toBe('number');

      const diffs: DiffEntry[] = [];
      collectDiffs(
        {
          id: mongoNode.id,
          origId: mongoNode.origId,
          clusterId: mongoNode.clusterId,
          clusterName: mongoNode.clusterName,
          numMessages: mongoNode.numMessages,
          sourceType: mongoNode.sourceType,
        },
        {
          id: neo4jNode.id,
          origId: neo4jNode.origId,
          clusterId: neo4jNode.clusterId,
          clusterName: neo4jNode.clusterName,
          numMessages: neo4jNode.numMessages,
          sourceType: neo4jNode.sourceType,
        },
        `findNode(id=${targetId})`,
        diffs,
      );
      assertNoDiffs(diffs, `findNode(id=${targetId})`);
    });
  });

  // ── findNodesByOrigIds ─────────────────────────────────────────────────────

  describe('findNodesByOrigIds — batch lookup by source IDs', () => {
    it('returned set must be identical for the same origId batch', async () => {
      const mongoNodes = await mongoService.listNodes(userId);
      if (mongoNodes.length === 0) return;

      const origIds = mongoNodes.slice(0, Math.min(5, mongoNodes.length)).map((n) => n.origId);
      const mongoResult = await mongoService.findNodesByOrigIds(userId, origIds);
      const neo4jResult = await neo4jService.findNodesByOrigIds(userId, origIds);

      expect(neo4jResult.length).toBe(mongoResult.length);
      compareById(mongoResult, neo4jResult, 'findNodesByOrigIds', [
        'id',
        'origId',
        'clusterId',
        'numMessages',
      ] as const);
    });
  });

  // ── listNodesByCluster ─────────────────────────────────────────────────────

  describe('listNodesByCluster — cluster-scoped node list', () => {
    it('filtered results must match and all nodes must carry the queried clusterId', async () => {
      const mongoClusters = await mongoService.listClusters(userId);
      if (mongoClusters.length === 0) return;

      const clusterId = mongoClusters[0].id;
      const mongoByCluster = await mongoService.listNodesByCluster(userId, clusterId);
      const neo4jByCluster = await neo4jService.listNodesByCluster(userId, clusterId);

      expect(neo4jByCluster.length).toBe(mongoByCluster.length);

      for (const nNode of neo4jByCluster) {
        expect(nNode.clusterId).toBe(clusterId);
      }

      compareById(mongoByCluster, neo4jByCluster, 'listNodesByCluster', [
        'id',
        'origId',
        'clusterId',
        'numMessages',
      ] as const);
    });
  });

  // ── listEdges ──────────────────────────────────────────────────────────────

  describe('listEdges — edge relationships', () => {
    it('source/target/type/weight/intraCluster must be identical and type-safe', async () => {
      const mongoEdges = await mongoService.listEdges(userId);
      const neo4jEdges = await neo4jService.listEdges(userId);

      expect(neo4jEdges.length).toBe(mongoEdges.length);

      const neo4jEdgeById = new Map(neo4jEdges.map((e) => [e.id, e]));

      for (const mEdge of mongoEdges) {
        const nEdge = neo4jEdgeById.get(mEdge.id);
        expect(nEdge).toBeDefined();
        if (!nEdge) continue;

        // Type-safety checks: Neo4j returns integers as Long; adapters must unwrap them.
        expect(typeof nEdge.source).toBe('number');
        expect(typeof nEdge.target).toBe('number');
        expect(typeof nEdge.weight).toBe('number');
        expect(typeof nEdge.intraCluster).toBe('boolean');

        expect(nEdge.source).toBe(mEdge.source);
        expect(nEdge.target).toBe(mEdge.target);
        expect(['hard', 'insight']).toContain(nEdge.type);
        expect(nEdge.type).toBe(mEdge.type);
        expect(nEdge.weight).toBeCloseTo(mEdge.weight, 6);
        expect(nEdge.intraCluster).toBe(mEdge.intraCluster);
      }
    });
  });

  // ── listClusters ───────────────────────────────────────────────────────────

  describe('listClusters — cluster list', () => {
    it('all cluster scalar fields and themes array must match', async () => {
      const mongoClusters = await mongoService.listClusters(userId);
      const neo4jClusters = await neo4jService.listClusters(userId);

      expect(neo4jClusters.length).toBe(mongoClusters.length);

      const neo4jClusterById = new Map(neo4jClusters.map((c) => [c.id, c]));

      for (const mCluster of mongoClusters) {
        const nCluster = neo4jClusterById.get(mCluster.id);
        expect(nCluster).toBeDefined();
        if (!nCluster) continue;

        expect(typeof nCluster.id).toBe('string');
        expect(nCluster.id).toBe(mCluster.id);
        expect(typeof nCluster.name).toBe('string');
        expect(nCluster.name).toBe(mCluster.name);
        expect(typeof nCluster.description).toBe('string');
        expect(nCluster.description).toBe(mCluster.description);
        expect(typeof nCluster.size).toBe('number');
        expect(nCluster.size).toBe(mCluster.size);

        // themes: stored as an array; order is not guaranteed across stores
        expect(Array.isArray(nCluster.themes)).toBe(true);
        expect([...nCluster.themes].sort()).toEqual([...mCluster.themes].sort());
      }
    });
  });

  // ── listSubclusters ────────────────────────────────────────────────────────

  describe('listSubclusters — subcluster list', () => {
    it('nodeIds (number[]), representativeNodeId, density, and topKeywords must match', async () => {
      const mongoSubs = await mongoService.listSubclusters(userId);
      const neo4jSubs = await neo4jService.listSubclusters(userId);

      expect(neo4jSubs.length).toBe(mongoSubs.length);

      const neo4jSubById = new Map(neo4jSubs.map((s) => [s.id, s]));

      for (const mSub of mongoSubs) {
        const nSub = neo4jSubById.get(mSub.id);
        expect(nSub).toBeDefined();
        if (!nSub) continue;

        expect(typeof nSub.clusterId).toBe('string');
        expect(nSub.clusterId).toBe(mSub.clusterId);

        // nodeIds: every element must be a JS number, not a Neo4j Long
        expect(Array.isArray(nSub.nodeIds)).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((nSub.nodeIds as any[]).every((id) => typeof id === 'number')).toBe(true);
        expect([...nSub.nodeIds].sort((a, b) => a - b)).toEqual(
          [...mSub.nodeIds].sort((a, b) => a - b),
        );

        expect(typeof nSub.representativeNodeId).toBe('number');
        expect(nSub.representativeNodeId).toBe(mSub.representativeNodeId);

        expect(typeof nSub.size).toBe('number');
        expect(nSub.size).toBe(mSub.size);

        expect(typeof nSub.density).toBe('number');
        expect(nSub.density).toBeCloseTo(mSub.density, 6);

        // topKeywords: order-insensitive
        expect(Array.isArray(nSub.topKeywords)).toBe(true);
        expect([...nSub.topKeywords].sort()).toEqual([...mSub.topKeywords].sort());
      }
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats — graph statistics', () => {
    it('nodes/edges/clusters counts and status must be identical', async () => {
      const mongoStats = await mongoService.getStats(userId);
      const neo4jStats = await neo4jService.getStats(userId);

      expect(mongoStats).not.toBeNull();
      expect(neo4jStats).not.toBeNull();
      if (!mongoStats || !neo4jStats) return;

      // Type-safety: Neo4j integer hydration must produce JS numbers
      expect(typeof neo4jStats.nodes).toBe('number');
      expect(typeof neo4jStats.edges).toBe('number');
      expect(typeof neo4jStats.clusters).toBe('number');

      expect(neo4jStats.nodes).toBe(mongoStats.nodes);
      expect(neo4jStats.edges).toBe(mongoStats.edges);
      expect(neo4jStats.clusters).toBe(mongoStats.clusters);
      expect(neo4jStats.status).toBe(mongoStats.status);
    });
  });

  // ── getGraphSummary ────────────────────────────────────────────────────────

  describe('getGraphSummary — AI-generated summary', () => {
    it('overview totals and cluster analysis count must match', async () => {
      const mongoSummary = await mongoService.getGraphSummary(userId);
      const neo4jSummary = await neo4jService.getGraphSummary(userId);

      // Both absent is acceptable (graph not yet summarised)
      if (!mongoSummary) {
        expect(neo4jSummary).toBeNull();
        return;
      }

      expect(neo4jSummary).not.toBeNull();
      if (!neo4jSummary) return;

      // overview scalar totals
      expect(typeof neo4jSummary.overview.total_conversations).toBe('number');
      expect(neo4jSummary.overview.total_conversations).toBe(
        mongoSummary.overview.total_conversations,
      );

      expect(typeof neo4jSummary.overview.total_notes).toBe('number');
      expect(neo4jSummary.overview.total_notes).toBe(mongoSummary.overview.total_notes);

      expect(typeof neo4jSummary.overview.total_notions).toBe('number');
      expect(neo4jSummary.overview.total_notions).toBe(mongoSummary.overview.total_notions);

      // clusters array length
      expect(Array.isArray(neo4jSummary.clusters)).toBe(true);
      expect(neo4jSummary.clusters.length).toBe(mongoSummary.clusters.length);

      // detail_level enum
      expect(neo4jSummary.detail_level).toBe(mongoSummary.detail_level);
    });
  });
});

/**
 * @description Neo4j Roundtrip 검증 전용 사용자 ID입니다.
 *
 * 기존 마이그레이션 parity fixture와 섞이지 않도록 고정된 별도 userId를 사용합니다.
 * 이 블록은 MongoDB와 Neo4j에 동일한 쓰기/삭제/복구 명령을 각각 실행한 뒤,
 * 동일 read API 결과를 `collectDiffs` 기준으로 비교하여 Neo4j 증분 Cypher 경로가
 * MongoDB를 대체할 수 있는지 검증합니다.
 */
const ROUNDTRIP_USER_ID = 'roundtrip-test-user-migration-spec';

/**
 * @description Roundtrip 테스트에서 사용할 고정 시각 문자열입니다.
 *
 * DB별 repository가 `createdAt`/`updatedAt`을 재작성할 수 있으므로 비교 대상에서는
 * 시간 필드를 제외하지만, 입력 DTO가 서비스 유효성 검사를 안정적으로 통과하도록
 * 모든 fixture에 동일한 ISO timestamp를 부여합니다.
 */
const ROUNDTRIP_NOW = '2026-04-27T00:00:00.000Z';

/**
 * @description Roundtrip 전용 Cluster fixture입니다.
 *
 * Node의 `clusterId`는 Neo4j에서 속성이 아니라 `BELONGS_TO` 관계로 표현되어야 하므로,
 * Node upsert보다 먼저 Cluster를 생성해 관계 생성 Cypher가 실제로 동작하는지 확인합니다.
 */
const ROUNDTRIP_CLUSTER = {
  id: 'roundtrip-cluster-main',
  userId: ROUNDTRIP_USER_ID,
  name: 'Roundtrip Cluster',
  description: 'Neo4j migration roundtrip verification cluster',
  size: 2,
  themes: ['migration', 'neo4j', 'parity'],
  createdAt: ROUNDTRIP_NOW,
  updatedAt: ROUNDTRIP_NOW,
};

/**
 * @description Roundtrip 전용 Node fixture 3종입니다.
 *
 * A/B 노드는 Edge, Subcluster, Global delete/restore 검증에 남겨두고,
 * C 노드는 Node 단독 soft delete/restore/hard delete 생명주기를 검증하는 데 사용합니다.
 */
const ROUNDTRIP_NODE_A = {
  id: 910001,
  userId: ROUNDTRIP_USER_ID,
  origId: 'roundtrip-orig-a',
  clusterId: ROUNDTRIP_CLUSTER.id,
  clusterName: ROUNDTRIP_CLUSTER.name,
  timestamp: '2026-04-27T00:01:00.000Z',
  numMessages: 11,
  sourceType: 'chat' as const,
  createdAt: ROUNDTRIP_NOW,
  updatedAt: ROUNDTRIP_NOW,
};

const ROUNDTRIP_NODE_B = {
  id: 910002,
  userId: ROUNDTRIP_USER_ID,
  origId: 'roundtrip-orig-b',
  clusterId: ROUNDTRIP_CLUSTER.id,
  clusterName: ROUNDTRIP_CLUSTER.name,
  timestamp: '2026-04-27T00:02:00.000Z',
  numMessages: 22,
  sourceType: 'markdown' as const,
  createdAt: ROUNDTRIP_NOW,
  updatedAt: ROUNDTRIP_NOW,
};

const ROUNDTRIP_NODE_C = {
  id: 910003,
  userId: ROUNDTRIP_USER_ID,
  origId: 'roundtrip-orig-c',
  clusterId: ROUNDTRIP_CLUSTER.id,
  clusterName: ROUNDTRIP_CLUSTER.name,
  timestamp: '2026-04-27T00:03:00.000Z',
  numMessages: 33,
  sourceType: 'notion' as const,
  createdAt: ROUNDTRIP_NOW,
  updatedAt: ROUNDTRIP_NOW,
};

/**
 * @description Roundtrip 전용 Edge fixture입니다.
 *
 * 두 Node 사이의 관계 생성, soft delete, restore, source/target 기반 hard delete까지
 * 모두 같은 edge id와 source/target 조합으로 검증합니다.
 */
const ROUNDTRIP_EDGE = {
  id: 'roundtrip-edge-a-b',
  userId: ROUNDTRIP_USER_ID,
  source: ROUNDTRIP_NODE_A.id,
  target: ROUNDTRIP_NODE_B.id,
  weight: 0.875,
  type: 'insight' as const,
  intraCluster: true,
  createdAt: ROUNDTRIP_NOW,
  updatedAt: ROUNDTRIP_NOW,
};

/**
 * @description Roundtrip 전용 Subcluster fixture입니다.
 *
 * Neo4j에서는 `HAS_SUBCLUSTER`, `CONTAINS`, `REPRESENTS` 관계를 통해 복원되는 값들이므로
 * listSubclusters 결과에서 nodeIds, representativeNodeId, density, topKeywords를 함께 비교합니다.
 */
const ROUNDTRIP_SUBCLUSTER = {
  id: 'roundtrip-subcluster-main',
  userId: ROUNDTRIP_USER_ID,
  clusterId: ROUNDTRIP_CLUSTER.id,
  nodeIds: [ROUNDTRIP_NODE_A.id, ROUNDTRIP_NODE_B.id],
  representativeNodeId: ROUNDTRIP_NODE_A.id,
  size: 2,
  density: 0.42,
  topKeywords: ['roundtrip', 'cypher', 'restore'],
  createdAt: ROUNDTRIP_NOW,
  updatedAt: ROUNDTRIP_NOW,
};

/**
 * @description Roundtrip 비교에서 timestamp churn을 제거하고 Node의 의미 필드만 추출합니다.
 *
 * @param node MongoDB 또는 Neo4j에서 반환된 GraphNode DTO입니다.
 * @returns 두 저장소가 동일하게 보존해야 하는 Node 비교용 projection입니다.
 */
function roundtripNodeView(node: unknown): Record<string, unknown> {
  const value = node as Record<string, unknown>;
  return {
    id: value.id,
    userId: value.userId,
    origId: value.origId,
    clusterId: value.clusterId,
    clusterName: value.clusterName,
    timestamp: value.timestamp,
    numMessages: value.numMessages,
    sourceType: value.sourceType,
  };
}

/**
 * @description Roundtrip 비교에서 Edge의 의미 필드만 추출합니다.
 *
 * @param edge MongoDB 또는 Neo4j에서 반환된 GraphEdge DTO입니다.
 * @returns source/target/type/weight/intraCluster를 포함한 Edge 비교용 projection입니다.
 */
function roundtripEdgeView(edge: unknown): Record<string, unknown> {
  const value = edge as Record<string, unknown>;
  return {
    id: value.id,
    userId: value.userId,
    source: value.source,
    target: value.target,
    weight: value.weight,
    type: value.type,
    intraCluster: value.intraCluster,
  };
}

/**
 * @description Roundtrip 비교에서 Cluster의 의미 필드만 추출합니다.
 *
 * @param cluster MongoDB 또는 Neo4j에서 반환된 GraphCluster DTO입니다.
 * @returns 정렬된 themes를 포함한 Cluster 비교용 projection입니다.
 */
function roundtripClusterView(cluster: unknown): Record<string, unknown> {
  const value = cluster as Record<string, unknown>;
  return {
    id: value.id,
    userId: value.userId,
    name: value.name,
    description: value.description,
    size: value.size,
    themes: [...((value.themes as string[] | undefined) ?? [])].sort(),
  };
}

/**
 * @description Roundtrip 비교에서 Subcluster의 관계 복원 결과를 추출합니다.
 *
 * @param subcluster MongoDB 또는 Neo4j에서 반환된 GraphSubcluster DTO입니다.
 * @returns 정렬된 nodeIds/topKeywords를 포함한 Subcluster 비교용 projection입니다.
 */
function roundtripSubclusterView(subcluster: unknown): Record<string, unknown> {
  const value = subcluster as Record<string, unknown>;
  return {
    id: value.id,
    userId: value.userId,
    clusterId: value.clusterId,
    nodeIds: [...((value.nodeIds as number[] | undefined) ?? [])].sort((a, b) => a - b),
    representativeNodeId: value.representativeNodeId,
    size: value.size,
    density: value.density,
    topKeywords: [...((value.topKeywords as string[] | undefined) ?? [])].sort(),
  };
}

/**
 * @description id 기반 배열 결과를 안정적으로 정렬합니다.
 *
 * @param items MongoDB 또는 Neo4j에서 반환된 DTO 배열입니다.
 * @returns id 문자열 순서로 정렬된 새 배열입니다.
 */
function sortRoundtripById<T extends { id?: string | number }>(items: T[]): T[] {
  return [...items].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

/**
 * @description MongoDB와 Neo4j 결과를 기존 migration suite의 `collectDiffs` 기준으로 비교합니다.
 *
 * @param label 실패 메시지에 표시할 roundtrip 단계명입니다.
 * @param mongoValue MongoDB 서비스에서 조회한 projection입니다.
 * @param neo4jValue Neo4j 서비스에서 조회한 projection입니다.
 * @returns diff가 없으면 void를 반환합니다.
 * @throws 두 projection이 다르면 `assertNoDiffs`를 통해 상세 필드 차이를 포함한 Error를 던집니다.
 */
function assertRoundtripNoDiffs(label: string, mongoValue: unknown, neo4jValue: unknown): void {
  const diffs: DiffEntry[] = [];
  collectDiffs(mongoValue, neo4jValue, label, diffs);
  assertNoDiffs(diffs, label);
}

/**
 * @description Neo4j Roundtrip 통합 테스트입니다.
 *
 * 이 테스트는 MongoDB와 Neo4j에 동일한 mutation을 순서대로 실행하고 동일 read API로 결과를
 * 비교합니다. 전체 스냅샷 재동기화가 아니라 Neo4j adapter의 개별 증분 Cypher가 실제로
 * write/read/soft delete/restore/hard delete를 감당하는지 검증하는 목적입니다.
 */
describe('Macro Graph Migration: Neo4j Roundtrip Write/Read/Delete/Restore', () => {
  let mongoService: GraphManagementService;
  let neo4jService: GraphManagementService;

  /**
   * @description roundtrip 전용 DB 연결 및 서비스 준비 단계입니다.
   *
   * 기존 migration fixture와 격리하기 위해 시작 시점에 roundtrip userId의 잔여 데이터를
   * 양쪽 저장소에서 permanent delete로 제거합니다. Neo4j adapter는 `findNodesByOrigIdsAll`
   * GraphDocumentStore 메서드가 없으므로, 같은 의미의 includeDeleted 조회를 테스트 서비스에
   * 주입해 soft delete 포함 조회 경로까지 검증합니다.
   */
  beforeAll(async () => {
    await initMongo(MONGO_URI);
    await initNeo4j();

    const mongoRepo = new GraphRepositoryMongo();
    const neo4jRepo = new Neo4jMacroGraphAdapter();
    const neo4jRepoWithAll = neo4jRepo as unknown as {
      findNodesByOrigIds: (
        userId: string,
        origIds: string[],
        options?: { includeDeleted?: boolean },
      ) => Promise<unknown[]>;
      findNodesByOrigIdsAll?: (userId: string, origIds: string[]) => Promise<unknown[]>;
    };

    // Neo4j에는 별도 findNodesByOrigIdsAll 포트가 없으므로 includeDeleted 옵션으로 동일 의미를 구성합니다.
    neo4jRepoWithAll.findNodesByOrigIdsAll = (targetUserId, origIds) =>
      neo4jRepoWithAll.findNodesByOrigIds(targetUserId, origIds, { includeDeleted: true });

    mongoService = new GraphManagementService(mongoRepo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neo4jService = new GraphManagementService(neo4jRepoWithAll as any);

    // 이전 실패 실행에서 남은 fixture가 있으면 이번 roundtrip 결과를 오염시키므로 먼저 물리 삭제합니다.
    await mongoService.deleteGraph(ROUNDTRIP_USER_ID, true);
    await neo4jService.deleteGraph(ROUNDTRIP_USER_ID, true);
  }, 60_000);

  /**
   * @description roundtrip fixture 영구 삭제 및 연결 종료 단계입니다.
   *
   * 테스트 도중 실패하더라도 다음 실행에 영향을 주지 않도록 MongoDB와 Neo4j 모두에
   * permanent delete를 수행한 뒤 각 DB 연결을 종료합니다.
   */
  afterAll(async () => {
    if (mongoService && neo4jService) {
      await mongoService.deleteGraph(ROUNDTRIP_USER_ID, true);
      await neo4jService.deleteGraph(ROUNDTRIP_USER_ID, true);
    }

    await disconnectMongo();
    await closeNeo4j();
  }, 60_000);

  /**
   * @description Node, Edge, Cluster, Subcluster, Global delete/restore 전체 생명주기 검증입니다.
   *
   * @returns 모든 roundtrip 단계가 MongoDB와 Neo4j에서 동일하면 resolve됩니다.
   * @throws 각 단계의 read projection이 다르면 `collectDiffs` 기반 상세 diff를 포함해 실패합니다.
   */
  it('write-read-soft delete-restore-hard delete 전체 roundtrip 결과가 MongoDB와 Neo4j에서 동일하다', async () => {
    /**
     * @description 동일 mutation을 MongoDB 서비스와 Neo4j 서비스에 순서대로 적용합니다.
     *
     * @param action 각 저장소 서비스에 실행할 mutation 함수입니다.
     * @returns 양쪽 저장소 mutation이 끝나면 resolve됩니다.
     */
    const writeBoth = async (
      action: (service: GraphManagementService) => Promise<unknown>,
    ): Promise<void> => {
      await action(mongoService);
      await action(neo4jService);
    };

    /**
     * @description 동일 read를 양쪽 서비스에서 수행한 뒤 projection 결과를 비교합니다.
     *
     * @param label diff 출력에 사용할 단계명입니다.
     * @param read 각 저장소 서비스에 실행할 read 함수입니다.
     * @param view DB별 timestamp churn을 제거하고 의미 필드만 남기는 projection 함수입니다.
     * @returns 양쪽 projection이 같으면 resolve됩니다.
     */
    const compareOne = async <T>(
      label: string,
      read: (service: GraphManagementService) => Promise<T>,
      view: (value: T) => unknown,
    ): Promise<void> => {
      const mongoValue = await read(mongoService);
      const neo4jValue = await read(neo4jService);
      assertRoundtripNoDiffs(label, view(mongoValue), view(neo4jValue));
    };

    /**
     * @description 동일 list read를 양쪽 서비스에서 수행한 뒤 id 정렬 projection으로 비교합니다.
     *
     * @param label diff 출력에 사용할 단계명입니다.
     * @param read 각 저장소 서비스에 실행할 list read 함수입니다.
     * @param view 배열 원소별 projection 함수입니다.
     * @returns 양쪽 list projection이 같으면 resolve됩니다.
     */
    const compareList = async <T extends { id?: string | number }>(
      label: string,
      read: (service: GraphManagementService) => Promise<T[]>,
      view: (value: T) => unknown,
    ): Promise<void> => {
      const mongoValues = sortRoundtripById(await read(mongoService)).map(view);
      const neo4jValues = sortRoundtripById(await read(neo4jService)).map(view);
      assertRoundtripNoDiffs(label, mongoValues, neo4jValues);
    };

    // 1. Cluster를 먼저 생성해 이후 Node BELONGS_TO 관계 생성의 부모를 준비합니다.
    await writeBoth((service) => service.upsertCluster(ROUNDTRIP_CLUSTER));

    // 2. A/B/C Node를 동일하게 생성하고, C는 Node 단독 생명주기 검증 대상으로 사용합니다.
    await writeBoth((service) =>
      service.upsertNodes([ROUNDTRIP_NODE_A, ROUNDTRIP_NODE_B, ROUNDTRIP_NODE_C]),
    );

    // 3. Edge와 Subcluster를 생성해 관계형 Cypher 경로까지 roundtrip 대상으로 포함합니다.
    await writeBoth((service) => service.upsertEdge(ROUNDTRIP_EDGE));
    await writeBoth((service) => service.upsertSubcluster(ROUNDTRIP_SUBCLUSTER));

    // 4. Node read와 update를 검증합니다.
    await compareOne(
      'roundtrip.node.findNode.afterUpsert',
      (service) => service.findNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id),
      (value) => (value ? roundtripNodeView(value) : null),
    );

    await writeBoth((service) =>
      service.updateNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id, {
        timestamp: '2026-04-27T00:33:00.000Z',
        numMessages: 44,
      }),
    );

    await compareOne(
      'roundtrip.node.findNode.afterUpdate',
      (service) => service.findNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id),
      (value) => (value ? roundtripNodeView(value) : null),
    );

    // 5. Node soft delete 후 active list에서는 사라지고 All 조회 및 findNodesByOrigIdsAll에는 남아야 합니다.
    await writeBoth((service) => service.deleteNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id));

    await compareList(
      'roundtrip.node.listNodes.afterSoftDelete',
      (service) => service.listNodes(ROUNDTRIP_USER_ID),
      roundtripNodeView,
    );
    expect((await mongoService.listNodes(ROUNDTRIP_USER_ID)).some((n) => n.id === ROUNDTRIP_NODE_C.id)).toBe(false);
    expect((await neo4jService.listNodes(ROUNDTRIP_USER_ID)).some((n) => n.id === ROUNDTRIP_NODE_C.id)).toBe(false);

    await compareList(
      'roundtrip.node.listNodesAll.afterSoftDelete',
      (service) => service.listNodesAll(ROUNDTRIP_USER_ID),
      roundtripNodeView,
    );

    await compareList(
      'roundtrip.node.findNodesByOrigIdsAll.afterSoftDelete',
      (service) => service.findNodesByOrigIdsAll(ROUNDTRIP_USER_ID, [ROUNDTRIP_NODE_C.origId]),
      roundtripNodeView,
    );

    // 6. Node restore 후 다시 active read에 보여야 하며, 이후 hard delete로 완전히 제거합니다.
    await writeBoth((service) => service.restoreNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id));
    await compareOne(
      'roundtrip.node.findNode.afterRestore',
      (service) => service.findNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id),
      (value) => (value ? roundtripNodeView(value) : null),
    );

    await writeBoth((service) =>
      service.deleteNode(ROUNDTRIP_USER_ID, ROUNDTRIP_NODE_C.id, true),
    );
    await compareList(
      'roundtrip.node.findNodesByOrigIdsAll.afterHardDelete',
      (service) => service.findNodesByOrigIdsAll(ROUNDTRIP_USER_ID, [ROUNDTRIP_NODE_C.origId]),
      roundtripNodeView,
    );

    // 7. Global hard delete (permanent=true): MongoDB는 deleteAllGraphData에서 global soft-delete를
    // 지원하지 않으므로 permanent=true로 양쪽 영구 삭제합니다.
    // Neo4j global soft-delete/restore 는 아래 별도 describe 블록에서 Neo4j adapter 단위로 검증합니다.
    await writeBoth((service) => service.deleteGraph(ROUNDTRIP_USER_ID, true));
    await compareList(
      'roundtrip.global.listNodes.afterHardDeleteAll',
      (service) => service.listNodes(ROUNDTRIP_USER_ID),
      roundtripNodeView,
    );
    expect(await mongoService.listNodes(ROUNDTRIP_USER_ID)).toHaveLength(0);
    expect(await neo4jService.listNodes(ROUNDTRIP_USER_ID)).toHaveLength(0);
    // hard delete 후 listNodesAll도 비어야 합니다 (soft delete 흔적 없음).
    expect(await mongoService.listNodesAll(ROUNDTRIP_USER_ID)).toHaveLength(0);
    expect(await neo4jService.listNodesAll(ROUNDTRIP_USER_ID)).toHaveLength(0);

    // 8–11단계(Edge/Cluster/Subcluster 개별 생명주기)를 위해 A/B fixture를 재생성합니다.
    await writeBoth((service) => service.upsertCluster(ROUNDTRIP_CLUSTER));
    await writeBoth((service) => service.upsertNodes([ROUNDTRIP_NODE_A, ROUNDTRIP_NODE_B]));
    await writeBoth((service) => service.upsertEdge(ROUNDTRIP_EDGE));
    await writeBoth((service) => service.upsertSubcluster(ROUNDTRIP_SUBCLUSTER));

    // 8. Edge read, soft delete, restore, source/target 기반 hard delete를 검증합니다.
    await compareList(
      'roundtrip.edge.listEdges.afterUpsert',
      (service) => service.listEdges(ROUNDTRIP_USER_ID),
      roundtripEdgeView,
    );

    await writeBoth((service) => service.deleteEdge(ROUNDTRIP_USER_ID, ROUNDTRIP_EDGE.id));
    await compareList(
      'roundtrip.edge.listEdges.afterSoftDelete',
      (service) => service.listEdges(ROUNDTRIP_USER_ID),
      roundtripEdgeView,
    );
    expect((await mongoService.listEdges(ROUNDTRIP_USER_ID)).some((e) => e.id === ROUNDTRIP_EDGE.id)).toBe(false);
    expect((await neo4jService.listEdges(ROUNDTRIP_USER_ID)).some((e) => e.id === ROUNDTRIP_EDGE.id)).toBe(false);

    await writeBoth((service) => service.restoreEdge(ROUNDTRIP_USER_ID, ROUNDTRIP_EDGE.id));
    await compareList(
      'roundtrip.edge.listEdges.afterRestore',
      (service) => service.listEdges(ROUNDTRIP_USER_ID),
      roundtripEdgeView,
    );

    await writeBoth((service) =>
      service.deleteEdgeBetween(
        ROUNDTRIP_USER_ID,
        ROUNDTRIP_EDGE.source,
        ROUNDTRIP_EDGE.target,
        true,
      ),
    );
    await compareList(
      'roundtrip.edge.listEdges.afterHardDeleteBetween',
      (service) => service.listEdges(ROUNDTRIP_USER_ID),
      roundtripEdgeView,
    );

    // 9. Cluster find/list와 Subcluster list를 비교해 관계 기반 read projection을 검증합니다.
    await compareOne(
      'roundtrip.cluster.findCluster.afterUpsert',
      (service) => service.findCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id),
      (value) => (value ? roundtripClusterView(value) : null),
    );
    await compareList(
      'roundtrip.cluster.listClusters.afterUpsert',
      (service) => service.listClusters(ROUNDTRIP_USER_ID),
      roundtripClusterView,
    );
    await compareList(
      'roundtrip.subcluster.listSubclusters.afterUpsert',
      (service) => service.listSubclusters(ROUNDTRIP_USER_ID),
      roundtripSubclusterView,
    );

    // 10. Subcluster soft delete, restore, hard delete 생명주기를 검증합니다.
    await writeBoth((service) =>
      service.deleteSubcluster(ROUNDTRIP_USER_ID, ROUNDTRIP_SUBCLUSTER.id),
    );
    await compareList(
      'roundtrip.subcluster.listSubclusters.afterSoftDelete',
      (service) => service.listSubclusters(ROUNDTRIP_USER_ID),
      roundtripSubclusterView,
    );

    await writeBoth((service) =>
      service.restoreSubcluster(ROUNDTRIP_USER_ID, ROUNDTRIP_SUBCLUSTER.id),
    );
    await compareList(
      'roundtrip.subcluster.listSubclusters.afterRestore',
      (service) => service.listSubclusters(ROUNDTRIP_USER_ID),
      roundtripSubclusterView,
    );

    await writeBoth((service) =>
      service.deleteSubcluster(ROUNDTRIP_USER_ID, ROUNDTRIP_SUBCLUSTER.id, true),
    );
    await compareList(
      'roundtrip.subcluster.listSubclusters.afterHardDelete',
      (service) => service.listSubclusters(ROUNDTRIP_USER_ID),
      roundtripSubclusterView,
    );

    // 11. Cluster soft delete, restore, hard delete 생명주기를 findCluster와 listClusters로 검증합니다.
    await writeBoth((service) => service.deleteCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id));
    await compareOne(
      'roundtrip.cluster.findCluster.afterSoftDelete',
      (service) => service.findCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id),
      (value) => (value ? roundtripClusterView(value) : null),
    );
    await compareList(
      'roundtrip.cluster.listClusters.afterSoftDelete',
      (service) => service.listClusters(ROUNDTRIP_USER_ID),
      roundtripClusterView,
    );

    await writeBoth((service) => service.restoreCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id));
    await compareOne(
      'roundtrip.cluster.findCluster.afterRestore',
      (service) => service.findCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id),
      (value) => (value ? roundtripClusterView(value) : null),
    );

    await writeBoth((service) =>
      service.deleteCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id, true),
    );
    await compareOne(
      'roundtrip.cluster.findCluster.afterHardDelete',
      (service) => service.findCluster(ROUNDTRIP_USER_ID, ROUNDTRIP_CLUSTER.id),
      (value) => (value ? roundtripClusterView(value) : null),
    );
    await compareList(
      'roundtrip.cluster.listClusters.afterHardDelete',
      (service) => service.listClusters(ROUNDTRIP_USER_ID),
      roundtripClusterView,
    );
  }, 120_000);
});

// ─── Additional Roundtrip Cases ───────────────────────────────────────────────
//
// 아래 describe 블록은 메인 roundtrip에서 다루지 않은 추가 케이스를 검증합니다:
//   - deleteNodesByOrigIds / restoreNodesByOrigIds (origId 기반 soft/hard delete 경로)
//   - deleteEdgesByNodeIds (nodeId 배열 기반 엣지 일괄 soft/hard delete)
//   - Neo4j global soft-delete + restoreAllGraphData (MongoDB가 미지원하는 경로의 Neo4j 단독 검증)
//   - soft delete 멱등성 (동일 노드에 두 번 soft delete → 여전히 비활성, deletedAt 단조 증가)
//   - hard delete 후 listNodesAll = 0 (soft delete 흔적 없이 완전 제거 확인)

/**
 * @description 추가 roundtrip 테스트에서 사용할 고정 사용자 ID입니다.
 * 메인 roundtrip fixture와 격리하기 위해 별도 ID를 사용합니다.
 */
const EXT_USER_ID = 'roundtrip-ext-test-user-migration-spec';

const EXT_CLUSTER = {
  id: 'ext-cluster-main',
  userId: EXT_USER_ID,
  name: 'Ext Test Cluster',
  description: 'Extension test cluster for additional roundtrip cases',
  size: 2,
  themes: ['ext', 'migration', 'parity'],
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

const EXT_NODE_X = {
  id: 930001,
  userId: EXT_USER_ID,
  origId: 'ext-orig-x',
  clusterId: EXT_CLUSTER.id,
  clusterName: EXT_CLUSTER.name,
  timestamp: '2026-04-27T00:01:00.000Z',
  numMessages: 5,
  sourceType: 'chat' as const,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

const EXT_NODE_Y = {
  id: 930002,
  userId: EXT_USER_ID,
  origId: 'ext-orig-y',
  clusterId: EXT_CLUSTER.id,
  clusterName: EXT_CLUSTER.name,
  timestamp: '2026-04-27T00:02:00.000Z',
  numMessages: 7,
  sourceType: 'markdown' as const,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

const EXT_EDGE_XY = {
  id: 'ext-edge-x-y',
  userId: EXT_USER_ID,
  source: EXT_NODE_X.id,
  target: EXT_NODE_Y.id,
  weight: 0.6,
  type: 'hard' as const,
  intraCluster: true,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

describe('Macro Graph Migration: Additional Roundtrip Cases', () => {
  let mongoService: GraphManagementService;
  let neo4jService: GraphManagementService;

  beforeAll(async () => {
    await initMongo(MONGO_URI);
    await initNeo4j();

    const mongoRepo = new GraphRepositoryMongo();
    const neo4jRepo = new Neo4jMacroGraphAdapter();

    // Neo4j adapter에 findNodesByOrigIdsAll을 monkey-patch합니다.
    // MacroGraphStore 포트에는 별도 메서드가 없으므로 includeDeleted 옵션을 통해 동등 동작을 구성합니다.
    const neo4jRepoWithAll = neo4jRepo as unknown as {
      findNodesByOrigIds: (
        userId: string,
        origIds: string[],
        options?: { includeDeleted?: boolean },
      ) => Promise<unknown[]>;
      findNodesByOrigIdsAll?: (userId: string, origIds: string[]) => Promise<unknown[]>;
    };
    neo4jRepoWithAll.findNodesByOrigIdsAll = (u, origIds) =>
      neo4jRepoWithAll.findNodesByOrigIds(u, origIds, { includeDeleted: true });

    mongoService = new GraphManagementService(mongoRepo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neo4jService = new GraphManagementService(neo4jRepoWithAll as any);

    // 이전 실행 잔여 데이터 제거
    await mongoService.deleteGraph(EXT_USER_ID, true);
    await neo4jService.deleteGraph(EXT_USER_ID, true);
  }, 60_000);

  afterAll(async () => {
    if (mongoService && neo4jService) {
      await mongoService.deleteGraph(EXT_USER_ID, true);
      await neo4jService.deleteGraph(EXT_USER_ID, true);
    }
    await disconnectMongo();
    await closeNeo4j();
  }, 60_000);

  /**
   * @description 동일 mutation을 두 저장소에 순서대로 적용하는 헬퍼입니다.
   */
  const writeBothExt = async (
    action: (service: GraphManagementService) => Promise<unknown>,
  ): Promise<void> => {
    await action(mongoService);
    await action(neo4jService);
  };

  /**
   * @description EXT fixture를 두 저장소에 동일하게 준비합니다.
   */
  const setupExtFixture = async (includeEdge = true): Promise<void> => {
    await writeBothExt((s) => s.upsertCluster(EXT_CLUSTER));
    await writeBothExt((s) => s.upsertNodes([EXT_NODE_X, EXT_NODE_Y]));
    if (includeEdge) {
      await writeBothExt((s) => s.upsertEdge(EXT_EDGE_XY));
    }
  };

  /**
   * @description EXT fixture를 두 저장소에서 모두 영구 제거합니다.
   */
  const teardownExtFixture = async (): Promise<void> => {
    await writeBothExt((s) => s.deleteGraph(EXT_USER_ID, true));
  };

  // ── deleteNodesByOrigIds + restoreNodesByOrigIds ──────────────────────────

  it('deleteNodesByOrigIds — soft delete: X 비활성화·Y 유지, findNodesByOrigIdsAll로 X 확인', async () => {
    await setupExtFixture(false);

    // X만 origId 기반 soft delete
    await writeBothExt((s) => s.deleteNodesByOrigIds(EXT_USER_ID, [EXT_NODE_X.origId]));

    const mongoActive = await mongoService.listNodes(EXT_USER_ID);
    const neo4jActive = await neo4jService.listNodes(EXT_USER_ID);
    // X는 active list에서 사라져야 합니다
    expect(mongoActive.some((n) => n.origId === EXT_NODE_X.origId)).toBe(false);
    expect(neo4jActive.some((n) => n.origId === EXT_NODE_X.origId)).toBe(false);
    // Y는 여전히 active list에 있어야 합니다
    expect(mongoActive.some((n) => n.origId === EXT_NODE_Y.origId)).toBe(true);
    expect(neo4jActive.some((n) => n.origId === EXT_NODE_Y.origId)).toBe(true);
    // 양쪽 active count가 동일해야 합니다
    expect(neo4jActive.length).toBe(mongoActive.length);

    // X는 findNodesByOrigIdsAll에서 조회되어야 하며 deletedAt이 non-null이어야 합니다
    const mongoAllX = await mongoService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    const neo4jAllX = await neo4jService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    expect(mongoAllX).toHaveLength(1);
    expect(neo4jAllX).toHaveLength(1);
    // deletedAt != null (MongoDB = number, Neo4j = number)
    expect(mongoAllX[0].deletedAt != null).toBe(true);
    expect(neo4jAllX[0].deletedAt != null).toBe(true);
    expect(typeof neo4jAllX[0].deletedAt).toBe('number');

    await teardownExtFixture();
  }, 60_000);

  it('restoreNodesByOrigIds — soft delete 후 restore: X가 active list에 복귀하고 deletedAt이 null/undefined', async () => {
    await setupExtFixture(false);

    // X soft delete → restore
    await writeBothExt((s) => s.deleteNodesByOrigIds(EXT_USER_ID, [EXT_NODE_X.origId]));
    await writeBothExt((s) => s.restoreNodesByOrigIds(EXT_USER_ID, [EXT_NODE_X.origId]));

    const mongoActive = await mongoService.listNodes(EXT_USER_ID);
    const neo4jActive = await neo4jService.listNodes(EXT_USER_ID);
    expect(neo4jActive.length).toBe(mongoActive.length);
    expect(neo4jActive.some((n) => n.origId === EXT_NODE_X.origId)).toBe(true);
    expect(mongoActive.some((n) => n.origId === EXT_NODE_X.origId)).toBe(true);

    // restore 후 deletedAt은 null 또는 undefined (양쪽 모두 == null)
    const mongoXRestored = await mongoService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    const neo4jXRestored = await neo4jService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    expect(mongoXRestored[0].deletedAt == null).toBe(true);
    expect(neo4jXRestored[0].deletedAt == null).toBe(true);

    await teardownExtFixture();
  }, 60_000);

  it('deleteNodesByOrigIds — hard delete: listNodesAll에서도 완전히 사라짐', async () => {
    await setupExtFixture(false);

    // X hard delete by origId
    await writeBothExt((s) =>
      s.deleteNodesByOrigIds(EXT_USER_ID, [EXT_NODE_X.origId], true),
    );

    // active list에서 사라져야 합니다
    const mongoActive = await mongoService.listNodes(EXT_USER_ID);
    const neo4jActive = await neo4jService.listNodes(EXT_USER_ID);
    expect(mongoActive.some((n) => n.origId === EXT_NODE_X.origId)).toBe(false);
    expect(neo4jActive.some((n) => n.origId === EXT_NODE_X.origId)).toBe(false);
    expect(neo4jActive.length).toBe(mongoActive.length);

    // findNodesByOrigIdsAll에서도 완전히 사라져야 합니다 (hard delete)
    const mongoAllAfterHard = await mongoService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    const neo4jAllAfterHard = await neo4jService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    expect(mongoAllAfterHard).toHaveLength(0);
    expect(neo4jAllAfterHard).toHaveLength(0);

    await teardownExtFixture();
  }, 60_000);

  // ── deleteEdgesByNodeIds ──────────────────────────────────────────────────

  it('deleteEdgesByNodeIds — soft delete: 연결 엣지가 active list에서 사라짐', async () => {
    await setupExtFixture(true);

    // X에 연결된 엣지 soft delete
    await writeBothExt((s) => s.deleteEdgesByNodeIds(EXT_USER_ID, [EXT_NODE_X.id]));

    const mongoEdges = await mongoService.listEdges(EXT_USER_ID);
    const neo4jEdges = await neo4jService.listEdges(EXT_USER_ID);
    expect(mongoEdges.some((e) => e.id === EXT_EDGE_XY.id)).toBe(false);
    expect(neo4jEdges.some((e) => e.id === EXT_EDGE_XY.id)).toBe(false);
    expect(neo4jEdges.length).toBe(mongoEdges.length);

    await teardownExtFixture();
  }, 60_000);

  it('deleteEdgesByNodeIds — restore 후 hard delete: active list에서 완전히 제거', async () => {
    await setupExtFixture(true);

    // soft delete → restore → hard delete 순서 검증
    await writeBothExt((s) => s.deleteEdgesByNodeIds(EXT_USER_ID, [EXT_NODE_X.id]));
    await writeBothExt((s) => s.restoreEdge(EXT_USER_ID, EXT_EDGE_XY.id));

    const mongoAfterRestore = await mongoService.listEdges(EXT_USER_ID);
    const neo4jAfterRestore = await neo4jService.listEdges(EXT_USER_ID);
    expect(mongoAfterRestore.some((e) => e.id === EXT_EDGE_XY.id)).toBe(true);
    expect(neo4jAfterRestore.some((e) => e.id === EXT_EDGE_XY.id)).toBe(true);
    expect(neo4jAfterRestore.length).toBe(mongoAfterRestore.length);

    // Y 기준으로 hard delete
    await writeBothExt((s) => s.deleteEdgesByNodeIds(EXT_USER_ID, [EXT_NODE_Y.id], true));

    const mongoAfterHard = await mongoService.listEdges(EXT_USER_ID);
    const neo4jAfterHard = await neo4jService.listEdges(EXT_USER_ID);
    expect(mongoAfterHard.some((e) => e.id === EXT_EDGE_XY.id)).toBe(false);
    expect(neo4jAfterHard.some((e) => e.id === EXT_EDGE_XY.id)).toBe(false);
    expect(neo4jAfterHard.length).toBe(mongoAfterHard.length);

    await teardownExtFixture();
  }, 60_000);

  // ── Soft delete 멱등성 ──────────────────────────────────────────────────

  it('soft delete 멱등성 — 두 번 soft delete해도 노드가 비활성 상태를 유지하고 deletedAt이 number', async () => {
    await setupExtFixture(false);

    // 첫 번째 soft delete
    await writeBothExt((s) => s.deleteNode(EXT_USER_ID, EXT_NODE_X.id));

    const mongoAllFirst = await mongoService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    const deletedAtFirst = mongoAllFirst[0].deletedAt as number;
    expect(deletedAtFirst != null).toBe(true);

    // 두 번째 soft delete (이미 삭제된 노드에 재시도)
    await writeBothExt((s) => s.deleteNode(EXT_USER_ID, EXT_NODE_X.id));

    // active list에 여전히 없어야 합니다
    const mongoActive = await mongoService.listNodes(EXT_USER_ID);
    const neo4jActive = await neo4jService.listNodes(EXT_USER_ID);
    expect(mongoActive.some((n) => n.id === EXT_NODE_X.id)).toBe(false);
    expect(neo4jActive.some((n) => n.id === EXT_NODE_X.id)).toBe(false);
    expect(neo4jActive.length).toBe(mongoActive.length);

    // deletedAt이 여전히 non-null이고 number여야 합니다
    const mongoAllSecond = await mongoService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    const neo4jAllSecond = await neo4jService.findNodesByOrigIdsAll(EXT_USER_ID, [EXT_NODE_X.origId]);
    expect(mongoAllSecond[0].deletedAt != null).toBe(true);
    expect(neo4jAllSecond[0].deletedAt != null).toBe(true);
    expect(typeof neo4jAllSecond[0].deletedAt).toBe('number');
    // 두 번째 deletedAt ≥ 첫 번째 deletedAt (단조 증가 또는 동일)
    expect((neo4jAllSecond[0].deletedAt as number)).toBeGreaterThanOrEqual(deletedAtFirst);

    await teardownExtFixture();
  }, 60_000);

  // ── Neo4j global soft-delete / restoreAllGraphData ────────────────────────
  //
  // MongoDB의 deleteAllGraphData는 항상 hard delete이며 restoreAllGraphData를 지원하지 않습니다.
  // 아래 테스트는 Neo4j adapter가 global soft-delete/restore를 올바르게 수행하는지
  // Neo4j 단독으로 검증합니다.

  it('Neo4j global soft-delete: deleteGraph(soft) 후 listNodes=0, restoreGraph 후 원복', async () => {
    await setupExtFixture(true);

    // Neo4j 전용: soft delete (permanent=undefined)
    await neo4jService.deleteGraph(EXT_USER_ID);

    // soft delete 후 active list는 비어야 합니다
    expect(await neo4jService.listNodes(EXT_USER_ID)).toHaveLength(0);
    expect(await neo4jService.listEdges(EXT_USER_ID)).toHaveLength(0);
    expect(await neo4jService.listClusters(EXT_USER_ID)).toHaveLength(0);

    // soft delete이므로 listNodesAll에서는 여전히 조회되어야 합니다
    const allAfterSoftDelete = await neo4jService.listNodesAll(EXT_USER_ID);
    expect(allAfterSoftDelete.length).toBeGreaterThan(0);
    expect(allAfterSoftDelete.every((n) => n.deletedAt != null)).toBe(true);

    // restoreGraph로 전체 복원
    await neo4jService.restoreGraph(EXT_USER_ID);

    // restore 후 active list가 복원되어야 합니다
    const nodesAfterRestore = await neo4jService.listNodes(EXT_USER_ID);
    expect(nodesAfterRestore.length).toBe(2); // X + Y
    const edgesAfterRestore = await neo4jService.listEdges(EXT_USER_ID);
    expect(edgesAfterRestore.length).toBe(1); // EXT_EDGE_XY
    const clustersAfterRestore = await neo4jService.listClusters(EXT_USER_ID);
    expect(clustersAfterRestore.length).toBe(1); // EXT_CLUSTER

    // restore 후 deletedAt이 null/undefined여야 합니다 (== null check)
    expect(nodesAfterRestore.every((n) => n.deletedAt == null)).toBe(true);

    // MongoDB에 대한 hard delete cleanup만 수행합니다 (Mongo는 soft delete 미지원이므로 setup만 했음)
    await mongoService.deleteGraph(EXT_USER_ID, true);
    await neo4jService.deleteGraph(EXT_USER_ID, true);
  }, 60_000);
});
