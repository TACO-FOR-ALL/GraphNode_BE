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
