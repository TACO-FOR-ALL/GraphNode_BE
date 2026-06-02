import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { isE2eFullSuiteEnabled, e2eFullSuiteSkipReason } from '../utils/e2e-llm-env';
import { seedTestData } from '../utils/db-seed';
import { createNeo4jE2eDriver } from '../utils/neo4j-test-driver';
import { MongoClient } from 'mongodb';

/**
 * AddNode 중복 노드 방지 & Ghost Cluster 정리 E2E 테스트 스펙
 *
 * 이 스펙은 다음 두 가지 엣지 케이스를 검증합니다:
 *
 * [시나리오 A] 동일 노드 재-AddNode 시 중복 렌더링 방지 (BELONGS_TO 엣지 누적 방지)
 *   - 기존 그래프에 이미 존재하는 origId를 포함한 노드를 AddNode를 통해 다시 처리합니다.
 *   - AI 결과로 해당 노드가 이전과 다른 clusterId에 배정되더라도,
 *     listNodes / snapshot API에서 해당 origId에 대한 노드가 정확히 1개만 반환되어야 합니다.
 *   - Neo4j에서 직접 BELONGS_TO 엣지 수가 1개임을 확인합니다.
 *
 * [시나리오 B] Ghost Cluster 자동 정리 검증
 *   - 위 시나리오 A 이후, 노드가 이탈한 이전 클러스터(Ghost Cluster)가 Neo4j에서
 *     자동으로 제거되었는지 검증합니다.
 *   - listClusters API 응답에 size=0인 클러스터가 포함되지 않아야 합니다.
 *   - Neo4j에서 직접 BELONGS_TO 연결 없는 MacroCluster 수가 0임을 확인합니다.
 *
 * 전제 조건:
 * - Scenario A/B는 기존 graph-flow.spec.ts의 Scenario 1(Full Graph Generation)이
 *   완료된 이후의 그래프 상태에서 동작합니다.
 * - E2E_SCOPE=full + LLM 키가 있을 때만 실행됩니다.
 *
 * @since 2026-06-01 Neo4j BELONGS_TO 엣지 누적 버그 수정 검증을 위해 추가
 */

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';

function toNumberFromNeo4j(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

/**
 * @description E2E 환경 여부에 따라 describe를 활성화 또는 스킵합니다.
 */
function describeAddNodeDedup(title: string, fn: () => void): void {
  const enabled = isE2eFullSuiteEnabled();
  const block = enabled ? describe : describe.skip;
  block(enabled ? title : e2eFullSuiteSkipReason() || title, fn);
}

describeAddNodeDedup('AddNode Dedup & Ghost Cluster Cleanup E2E', () => {
  const userId = getTestUserId();

  /**
   * 테스트 시작 전 DB 시드 및 Neo4j 초기화.
   * graph-flow.spec.ts와 동일한 seedTestData()를 재활용합니다.
   */
  beforeAll(async () => {
    await seedTestData();

    // Neo4j 초기화: 해당 유저의 기존 그래프 데이터 클린업
    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();
    try {
      await neo4jSession.run(
        'MATCH (n {userId: $userId}) DETACH DELETE n',
        { userId }
      );
      console.log('[Dedup E2E] Neo4j cleaned up for userId:', userId);
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }
  });

  /**
   * [사전 준비] 그래프를 먼저 생성해둡니다.
   * 이 테스트 케이스는 graph-flow Scenario 1과 동일한 흐름으로 그래프를 생성하여
   * 후속 시나리오 A/B의 전제 조건을 만들어줍니다.
   */
  it('사전 준비: 초기 그래프 생성 (Prerequisite)', async () => {
    console.log('[Dedup E2E] Prerequisite: Generating initial graph...');

    const response = await apiClient.post('/v1/graph-ai/generate', { includeSummary: false });
    expect(response.status).toBe(202);
    const taskId = response.data.taskId;
    console.log(`[Dedup E2E] Graph generation task queued: ${taskId}`);

    // Neo4j MacroStats CREATED 상태 폴링
    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();
    let isFinished = false;

    try {
      for (let i = 0; i < 60; i++) {
        const statsRes = await neo4jSession.run(
          'MATCH (g:MacroGraph {userId: $userId})-[:HAS_STATS]->(st:MacroStats) RETURN st.status AS status',
          { userId }
        );
        const status = statsRes.records[0]?.get('status') as string | undefined;

        if (status === 'CREATED') {
          isFinished = true;
          console.log('[Dedup E2E] Initial graph CREATED confirmed in Neo4j.');
          break;
        }
        if (status === 'NOT_CREATED') {
          console.error('[Dedup E2E] Graph generation failed (status=NOT_CREATED).');
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }

    expect(isFinished).toBe(true);
  });

  /**
   * [시나리오 A] 동일 origId가 다른 clusterId로 재-AddNode되어도 중복 노드가 발생하지 않음을 검증
   *
   * 검증 방법:
   * 1. 현재 Neo4j에서 기존 노드 중 하나(conv-e2e-123)의 origId와 clusterId를 기록합니다.
   * 2. AddNode API를 다시 호출하여 AI 파이프라인이 해당 노드를 다른 클러스터에 배정하는 상황을 유도합니다.
   *    (실제 AI 응답을 컨트롤할 수 없으므로, 재호출 후 결과를 Neo4j에서 직접 확인합니다.)
   * 3. AddNode 완료 후 Neo4j에서 해당 origId에 대한 MacroNode가 정확히 1개인지 확인합니다.
   * 4. 해당 노드의 BELONGS_TO 관계가 정확히 1개인지 Neo4j에서 직접 쿼리로 확인합니다.
   * 5. GET /v1/graph/snapshot API 응답에서 동일 origId가 중복 등장하지 않음을 확인합니다.
   */
  it('Scenario A: 동일 origId 재-AddNode 후 Neo4j BELONGS_TO 엣지가 1개임을 검증', async () => {
    console.log('[Dedup E2E] Scenario A: Re-AddNode dedup check...');

    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    // 새 대화 추가 (기존 origId가 다시 처리될 수 있도록 기존 대화도 포함)
    const newConvId = `conv-dedup-rerun-${Date.now()}`;
    const futureMs = Date.now() + 3000;

    try {
      await db.collection('conversations').insertOne({
        _id: newConvId,
        ownerUserId: userId,
        title: 'Dedup Re-run Test Chat',
        updatedAt: futureMs,
        createdAt: futureMs,
      } as any);

      await db.collection('messages').insertMany([
        {
          _id: `msg-dedup-u-${Date.now()}`,
          conversationId: newConvId,
          ownerUserId: userId,
          role: 'user',
          content: 'This is a message to trigger AddNode re-run for dedup testing.',
          createdAt: futureMs,
          updatedAt: futureMs,
        },
        {
          _id: `msg-dedup-a-${Date.now()}`,
          conversationId: newConvId,
          ownerUserId: userId,
          role: 'assistant',
          content: 'Dedup test: Adding nodes to an existing graph should not create duplicates.',
          createdAt: futureMs + 1000,
          updatedAt: futureMs + 1000,
        },
      ] as any);

      console.log(`[Dedup E2E] Inserted new conversation: ${newConvId}`);
    } finally {
      await mongoClient.close();
    }

    // AddNode API 재호출
    const addNodeRes = await apiClient.post('/v1/graph-ai/add-node');
    expect(addNodeRes.status).toBe(202);
    console.log('[Dedup E2E] AddNode re-run queued.');

    // Neo4j MacroStats UPDATED 상태 폴링
    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();
    let isFinished = false;

    try {
      for (let i = 0; i < 60; i++) {
        const statsRes = await neo4jSession.run(
          'MATCH (g:MacroGraph {userId: $userId})-[:HAS_STATS]->(st:MacroStats) RETURN st.status AS status',
          { userId }
        );
        const status = statsRes.records[0]?.get('status') as string | undefined;
        if (status === 'UPDATED') {
          isFinished = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      expect(isFinished).toBe(true);

      // ─── 핵심 검증 1: origId별 MacroNode 중복 체크 ───────────────────────────
      // listNodes에서 origId 기준으로 중복이 없어야 합니다.
      // BELONGS_TO 엣지 누적 버그가 있다면 동일 origId가 복수 rows로 반환됩니다.
      const allNodesRes = await neo4jSession.run(
        `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
         WHERE n.deletedAt IS NULL
         OPTIONAL MATCH (n)-[:BELONGS_TO]->(c:MacroCluster {userId: $userId})
         RETURN n.id AS id, n.origId AS origId, coalesce(c.id, '') AS clusterId`,
        { userId }
      );

      const nodesFromNeo4j = allNodesRes.records.map((r) => ({
        id: r.get('id') as number,
        origId: r.get('origId') as string,
        clusterId: r.get('clusterId') as string,
      }));

      console.log(`[Dedup E2E] Total Neo4j rows returned by BELONGS_TO join: ${nodesFromNeo4j.length}`);

      // origId별로 그룹핑하여 중복 여부 확인
      const origIdGroups = new Map<string, typeof nodesFromNeo4j>();
      for (const node of nodesFromNeo4j) {
        const group = origIdGroups.get(node.origId) ?? [];
        group.push(node);
        origIdGroups.set(node.origId, group);
      }

      // 어떤 origId도 2개 이상의 row를 반환하면 안 됩니다.
      for (const [origId, group] of origIdGroups.entries()) {
        if (group.length > 1) {
          console.error(
            `[Dedup E2E] DUPLICATE DETECTED! origId="${origId}" has ${group.length} rows:`,
            JSON.stringify(group)
          );
        }
        expect(group.length).toBe(1);
      }

      console.log('[Dedup E2E] ✅ No duplicate origId found in Neo4j listNodes result.');

      // ─── 핵심 검증 2: 특정 노드의 BELONGS_TO 엣지 수가 정확히 1개 ─────────────
      // conv-e2e-123 노드를 기준으로 BELONGS_TO 엣지가 1개인지 직접 쿼리합니다.
      const edgeCountRes = await neo4jSession.run(
        `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
         WHERE n.origId = $origId AND n.deletedAt IS NULL
         MATCH (n)-[r:BELONGS_TO]->()
         RETURN count(r) AS edgeCount`,
        { userId, origId: 'conv-e2e-123' }
      );

      if (edgeCountRes.records.length > 0) {
        const edgeCount = (edgeCountRes.records[0].get('edgeCount') as { toNumber(): number } | number);
        const edgeCountNum = typeof edgeCount === 'number' ? edgeCount : edgeCount.toNumber();
        console.log(`[Dedup E2E] BELONGS_TO edge count for conv-e2e-123: ${edgeCountNum}`);
        // BELONGS_TO 엣지가 1개를 초과하면 중복 버그가 있는 것
        expect(edgeCountNum).toBeLessThanOrEqual(1);
      } else {
        console.log('[Dedup E2E] conv-e2e-123 not found in Neo4j (may have been excluded by AI).');
      }

      // ─── 핵심 검증 3: API snapshot 응답에서 origId 중복 없음 ────────────────────
      const snapshotRes = await apiClient.get('/v1/graph/snapshot');
      expect(snapshotRes.status).toBe(200);

      const snapshotNodes = (snapshotRes.data?.nodes ?? []) as Array<{
        id: number;
        origId: string;
        clusterId: string;
      }>;

      const snapshotOrigIds = snapshotNodes.map((n) => n.origId);
      const snapshotOrigIdSet = new Set(snapshotOrigIds);

      console.log(
        `[Dedup E2E] Snapshot API nodes: ${snapshotNodes.length} (unique origIds: ${snapshotOrigIdSet.size})`
      );

      // origId 기준 중복이 없어야 합니다.
      expect(snapshotNodes.length).toBe(snapshotOrigIdSet.size);

      console.log('[Dedup E2E] ✅ Snapshot API returned no duplicate origIds.');
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }
  });

  it('Scenario C: AddNode 이후 snapshot에 stale subcluster membership이 내려오지 않음을 검증', async () => {
    console.log('[Dedup E2E] Scenario C: stale subcluster membership check...');

    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();

    try {
      const staleRelRes = await neo4jSession.run(
        `MATCH (subclusterCluster:MacroCluster {userId: $userId})-[:HAS_SUBCLUSTER]->(sc:MacroSubcluster {userId: $userId})-[rel:CONTAINS|REPRESENTS]->(n:MacroNode {userId: $userId})-[:BELONGS_TO]->(nodeCluster:MacroCluster {userId: $userId})
         WHERE n.deletedAt IS NULL
           AND subclusterCluster.id <> nodeCluster.id
         RETURN sc.id AS subclusterId,
                type(rel) AS relType,
                n.id AS nodeId,
                subclusterCluster.id AS subclusterClusterId,
                nodeCluster.id AS nodeClusterId
         LIMIT 20`,
        { userId }
      );

      const staleRels = staleRelRes.records.map((r) => ({
        subclusterId: r.get('subclusterId') as string,
        relType: r.get('relType') as string,
        nodeId: toNumberFromNeo4j(r.get('nodeId')),
        subclusterClusterId: r.get('subclusterClusterId') as string,
        nodeClusterId: r.get('nodeClusterId') as string,
      }));

      if (staleRels.length > 0) {
        console.error(
          `[Dedup E2E] STALE SUBCLUSTER RELATIONSHIPS DETECTED (${staleRels.length}):`,
          JSON.stringify(staleRels)
        );
      }
      expect(staleRels).toHaveLength(0);

      const snapshotRes = await apiClient.get('/v1/graph/snapshot');
      expect(snapshotRes.status).toBe(200);

      const snapshotNodes = (snapshotRes.data?.nodes ?? []) as Array<{
        id: number;
        clusterId: string;
      }>;
      const snapshotSubclusters = (snapshotRes.data?.subclusters ?? []) as Array<{
        id: string;
        clusterId: string;
        nodeIds?: number[];
        representativeNodeId?: number | null;
      }>;
      const nodeClusterById = new Map(snapshotNodes.map((node) => [node.id, node.clusterId]));
      const mismatches: Array<{
        subclusterId: string;
        subclusterClusterId: string;
        nodeId: number;
        nodeClusterId: string;
        membershipType: 'CONTAINS' | 'REPRESENTS';
      }> = [];

      for (const subcluster of snapshotSubclusters) {
        for (const nodeId of subcluster.nodeIds ?? []) {
          const nodeClusterId = nodeClusterById.get(nodeId);
          if (nodeClusterId && nodeClusterId !== subcluster.clusterId) {
            mismatches.push({
              subclusterId: subcluster.id,
              subclusterClusterId: subcluster.clusterId,
              nodeId,
              nodeClusterId,
              membershipType: 'CONTAINS',
            });
          }
        }

        if (subcluster.representativeNodeId != null) {
          const nodeClusterId = nodeClusterById.get(subcluster.representativeNodeId);
          if (nodeClusterId && nodeClusterId !== subcluster.clusterId) {
            mismatches.push({
              subclusterId: subcluster.id,
              subclusterClusterId: subcluster.clusterId,
              nodeId: subcluster.representativeNodeId,
              nodeClusterId,
              membershipType: 'REPRESENTS',
            });
          }
        }
      }

      if (mismatches.length > 0) {
        console.error(
          `[Dedup E2E] SNAPSHOT STALE SUBCLUSTER MEMBERSHIPS DETECTED (${mismatches.length}):`,
          JSON.stringify(mismatches)
        );
      }
      expect(mismatches).toHaveLength(0);

      console.log('[Dedup E2E] ✅ Snapshot returned no stale subcluster memberships.');
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }
  });

  /**
   * [시나리오 B] AddNode 완료 후 연결된 노드가 없는 Ghost Cluster가 Neo4j에 남아 있지 않음을 검증
   *
   * 검증 방법:
   * 1. Neo4j에서 HAS_CLUSTER로 연결된 모든 MacroCluster를 조회합니다.
   * 2. 각 클러스터에 대해 BELONGS_TO로 연결된 활성 MacroNode 수를 집계합니다.
   * 3. size=0인 클러스터(Ghost Cluster)가 존재하지 않아야 합니다.
   * 4. GET /v1/graph/clusters API 응답의 모든 클러스터 size가 1 이상이어야 합니다.
   */
  it('Scenario B: AddNode 완료 후 Ghost Cluster(size=0)가 Neo4j에 존재하지 않음을 검증', async () => {
    console.log('[Dedup E2E] Scenario B: Ghost Cluster cleanup check...');

    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();

    try {
      // ─── 핵심 검증 1: Neo4j에서 직접 Ghost Cluster 조회 ─────────────────────
      // 연결된 노드가 없는 클러스터 목록 쿼리
      const ghostClusterRes = await neo4jSession.run(
        `MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(c:MacroCluster {userId: $userId})
         WHERE NOT (c)<-[:BELONGS_TO]-()
         RETURN c.id AS clusterId, c.name AS clusterName`,
        { userId }
      );

      const ghostClusters = ghostClusterRes.records.map((r) => ({
        clusterId: r.get('clusterId') as string,
        clusterName: r.get('clusterName') as string,
      }));

      if (ghostClusters.length > 0) {
        console.error(
          `[Dedup E2E] GHOST CLUSTERS DETECTED (${ghostClusters.length}):`,
          JSON.stringify(ghostClusters)
        );
      } else {
        console.log('[Dedup E2E] ✅ No ghost clusters found in Neo4j.');
      }

      // Ghost Cluster가 0개여야 합니다.
      expect(ghostClusters.length).toBe(0);

      // ─── 핵심 검증 2: 전체 클러스터의 size 집계 검증 ────────────────────────
      // 모든 클러스터의 BELONGS_TO count를 확인하여 size=0이 없음을 재차 확인합니다.
      const clusterSizesRes = await neo4jSession.run(
        `MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(c:MacroCluster {userId: $userId})
         OPTIONAL MATCH (n:MacroNode {userId: $userId})-[:BELONGS_TO]->(c)
         WHERE n.deletedAt IS NULL
         RETURN c.id AS clusterId, count(DISTINCT n) AS size`,
        { userId }
      );

      const clusterSizes = clusterSizesRes.records.map((r) => ({
        clusterId: r.get('clusterId') as string,
        size: (r.get('size') as { toNumber(): number } | number),
      }));

      console.log(`[Dedup E2E] Total clusters in Neo4j: ${clusterSizes.length}`);

      for (const cluster of clusterSizes) {
        const size = typeof cluster.size === 'number' ? cluster.size : cluster.size.toNumber();
        if (size === 0) {
          console.error(`[Dedup E2E] GHOST CLUSTER: clusterId=${cluster.clusterId} has size=0`);
        }
        expect(size).toBeGreaterThan(0);
      }

      console.log('[Dedup E2E] ✅ All clusters have at least 1 connected node.');

      // ─── 핵심 검증 3: API clusters 엔드포인트 응답의 size 검증 ────────────────
      // GET /v1/graph/clusters API가 size=0인 클러스터를 반환하지 않아야 합니다.
      const clustersApiRes = await apiClient.get('/v1/graph/clusters');
      expect(clustersApiRes.status).toBe(200);

      const apiClusters = (clustersApiRes.data ?? []) as Array<{
        id: string;
        name: string;
        size: number;
      }>;

      console.log(`[Dedup E2E] Clusters from API: ${apiClusters.length}`);

      for (const cluster of apiClusters) {
        if (cluster.size === 0) {
          console.error(
            `[Dedup E2E] API returned ghost cluster: id=${cluster.id}, name="${cluster.name}", size=${cluster.size}`
          );
        }
        expect(cluster.size).toBeGreaterThan(0);
      }

      console.log('[Dedup E2E] ✅ API /v1/graph/clusters returned no ghost clusters.');
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }
  });
});
