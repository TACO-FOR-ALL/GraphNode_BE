import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { seedTestData } from '../utils/db-seed';
import { createNeo4jE2eDriver } from '../utils/neo4j-test-driver';
import { MongoClient } from 'mongodb';
import type { Session } from 'neo4j-driver';

/**
 * Graph AI 엔드투엔드(E2E) 테스트 스펙
 *
 * Neo4j 완전 도입 이후 Macro Graph 데이터(stats, nodes, clusters, edges, summaries)는
 * Neo4j에만 저장됩니다. MongoDB graph_nodes / graph_stats / graph_summaries 컬렉션은
 * 더 이상 사용하지 않으므로 모든 그래프 검증을 Neo4j 쿼리로 대체합니다.
 *
 * 시나리오 1: 전체 그래프 생성 (Graph Generation)
 * - 사용자의 대화/노트 데이터를 기반으로 지식 그래프 추출을 요청하고,
 *   비동기 작업(Worker/AI)이 완료되어 Neo4j에 'CREATED' 상태로 저장되는지 검증합니다.
 *
 * 시나리오 2: 그래프 요약 (Graph Summary)
 * - 생성된 그래프를 기반으로 AI 요약(Summary) 생성을 요청하고,
 *   최종적으로 Neo4j MacroSummary 노드에 데이터가 생성되는지 검증합니다.
 *
 * 시나리오 3: 노드 추가 (Add Node — 대화 + 노트 혼합)
 * - 기존에 생성된 그래프에 새로운 대화와 노트를 동시에 삽입하고 AddNode를 호출합니다.
 * - 비동기 AI 파이프라인이 완료된 후 Neo4j MacroNode에 대화 노드(nodeType: 'conversation')와
 *   노트 노드(nodeType: 'note')가 모두 저장되었는지 검증합니다.
 *
 * 시나리오 4: Graph Node Soft Delete 정합성 검증
 * - Neo4j에서 활성 노드를 찾아 API 소프트 삭제 후 Neo4j deletedAt 설정 여부를 검증합니다.
 */
describe('End-to-End Graph Flow', () => {
  const userId = getTestUserId();
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';
  let scenario1Passed = false;

  beforeAll(async () => {
    await seedTestData();

    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();
    try {
      await neo4jSession.run(
        'MATCH (n {userId: $userId}) DETACH DELETE n',
        { userId }
      );
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }
  });

  it('Scenario 1: Full Graph Generation Flow', async () => {
    console.log('--- Starting Scenario 1: Graph Generation ---');

    const response = await apiClient.post('/v1/graph-ai/generate', { includeSummary: true });
    expect(response.status).toBe(202);
    expect(response.data.status).toBe('queued');

    const taskId = response.data.taskId;
    console.log(`Task Enqueued: ${taskId}`);

    // MongoDB에서 conversations/notes 원본 ID 목록 수집 (여전히 MongoDB에 저장됨)
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    let expectedOrigIds: string[] = [];
    let expectedCount = 0;
    try {
      const conversations = await db
        .collection('conversations')
        .find({ ownerUserId: userId })
        .toArray();
      const notes = await db
        .collection('notes')
        .find({ ownerUserId: userId, deletedAt: null })
        .toArray();
      expectedOrigIds = [
        ...conversations.map((c) => c._id.toString()),
        ...notes.map((n) => n._id.toString()),
      ];
      expectedCount = expectedOrigIds.length;
      console.log(
        `Expected nodes: ${expectedCount} (Conversations: ${conversations.length}, Notes: ${notes.length})`
      );
      console.log(`Expected origIds: ${JSON.stringify([...expectedOrigIds].sort())}`);
    } finally {
      await mongoClient.close();
    }

    // Neo4j에서 MacroStats 상태 및 MacroNode 목록 폴링
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

        if (status === 'NOT_CREATED') {
          console.error('[Scenario 1] Graph generation permanently failed (status=NOT_CREATED). Aborting poll.');
          break;
        }

        if (status === 'CREATED') {
          // MacroNode 목록 조회 (BELONGS_TO로 cluster 정보도 함께)
          const nodesRes = await neo4jSession.run(
            `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
             WHERE n.deletedAt IS NULL
             OPTIONAL MATCH (n)-[:BELONGS_TO]->(c:MacroCluster {userId: $userId})
             RETURN n.id AS id, n.origId AS origId, n.nodeType AS nodeType,
                    n.numMessages AS numMessages, n.updatedAt AS updatedAt,
                    coalesce(c.id, '') AS clusterId`,
            { userId }
          );

          const nodes = nodesRes.records.map((r) => ({
            id: r.get('id') as number,
            origId: r.get('origId') as string,
            nodeType: r.get('nodeType') as string,
            numMessages: r.get('numMessages') as number,
            updatedAt: r.get('updatedAt') as string,
            clusterId: r.get('clusterId') as string,
          }));

          const actualCount = nodes.length;
          const actualOrigIds = nodes.map((n) => n.origId);

          console.log(`Validation: Found ${actualCount} nodes in Neo4j MacroNode.`);
          console.log(
            `MacroNode dump: ${JSON.stringify(
              nodes.map((n) => ({ id: n.id, origId: n.origId, nodeType: n.nodeType, clusterId: n.clusterId }))
            )}`
          );

          if (actualCount !== expectedCount) {
            console.error(
              `[Test Failed] Node count mismatch! Expected: ${expectedCount}, Actual: ${actualCount}`
            );
            throw new Error(
              `Graph generation finished but node count mismatch: ${actualCount} vs ${expectedCount}`
            );
          }

          for (const expectedId of expectedOrigIds) {
            if (!actualOrigIds.includes(expectedId)) {
              console.error(`[Test Failed] Missing node for origId: ${expectedId}`);
              throw new Error(
                `Graph generation finished but missing node for origId: ${expectedId}`
              );
            }
          }

          expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
          for (const node of nodes) {
            expect(typeof node.id).toBe('number');
            expect(Number.isFinite(node.id)).toBe(true);
            expect(node.origId).toBeTruthy();
          }

          // origId가 MongoDB conversation에 해당하면 nodeType === 'conversation'
          const mongoClient2 = new MongoClient(MONGO_URI);
          await mongoClient2.connect();
          const db2 = mongoClient2.db();
          try {
            const conversations = await db2.collection('conversations').find({ ownerUserId: userId }).toArray();
            const notes = await db2.collection('notes').find({ ownerUserId: userId, deletedAt: null }).toArray();
            for (const conv of conversations) {
              const node = nodes.find((n) => n.origId === conv._id.toString());
              expect(node?.nodeType).toBe('conversation');
            }
            for (const note of notes) {
              const node = nodes.find((n) => n.origId === note._id.toString());
              expect(node?.nodeType).toBe('note');
            }
          } finally {
            await mongoClient2.close();
          }

          isFinished = true;
          scenario1Passed = true;
          break;
        }

        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for graph creation... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nGraph creation confirmed in Neo4j.');
  });

  it('Scenario 2: Graph Summary Flow', async () => {
    console.log('\n--- Starting Scenario 2: Graph Summary ---');

    if (!scenario1Passed) {
      throw new Error(
        'Scenario 1 did not complete successfully. Scenario 2 requires a generated graph and cannot proceed.'
      );
    }

    const response = await apiClient.post('/v1/graph-ai/summary');
    expect(response.status).toBe(202);

    const taskId = response.data.taskId;
    console.log(`Summary Task Enqueued: ${taskId}`);

    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();
    let isFinished = false;
    let overviewJson: string | null = null;

    try {
      for (let i = 0; i < 60; i++) {
        const summaryRes = await neo4jSession.run(
          `MATCH (g:MacroGraph {userId: $userId})-[:HAS_SUMMARY]->(sm:MacroSummary)
           WHERE sm.deletedAt IS NULL
           RETURN sm.overviewJson AS overviewJson`,
          { userId }
        );
        if (summaryRes.records.length > 0) {
          overviewJson = summaryRes.records[0].get('overviewJson') as string | null;
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for summary... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nGraph summary confirmed in Neo4j.');

    expect(overviewJson).toBeTruthy();
    const overview = JSON.parse(overviewJson!);
    expect(overview).toBeTruthy();

    // MongoDB에서 conversations/notes 실제 개수 조회하여 summary 통계값과 비교
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();
    try {
      const actualConversations = await db
        .collection('conversations')
        .countDocuments({ ownerUserId: userId });
      const actualNotes = await db
        .collection('notes')
        .countDocuments({ ownerUserId: userId, deletedAt: null });

      console.log(`\n[Summary Verification]`);
      console.log(
        `- Total Conversations: actual=${actualConversations}, summary=${overview.total_conversations}`
      );
      console.log(`- Total Notes: actual=${actualNotes}, summary=${overview.total_notes}`);
      console.log(`- Total Notions: summary=${overview.total_notions}`);

      expect(overview.total_conversations).toBe(actualConversations);
      expect(overview.total_notes).toBe(actualNotes);
      expect(typeof overview.total_notions).toBe('number');
    } finally {
      await mongoClient.close();
    }
  });

  it('Scenario 3: Add Node to existing Graph (Conversation + Note)', async () => {
    console.log('\n--- Starting Scenario 3: Add Node (Conversation + Note) ---');

    if (!scenario1Passed) {
      throw new Error(
        'Scenario 1 did not complete successfully. Scenario 3 requires graph_nodes to be populated and cannot proceed.'
      );
    }

    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    // 기존 노드(conv-e2e-123)의 초기 상태를 Neo4j에서 가져옵니다.
    const neo4jDriverInit = createNeo4jE2eDriver();
    const neo4jSessionInit = neo4jDriverInit.session();
    let oldNumMessages = 0;
    let oldUpdatedAt = '';
    try {
      const initRes = await neo4jSessionInit.run(
        `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
         WHERE n.origId = $origId AND n.deletedAt IS NULL
         RETURN n.numMessages AS numMessages, n.updatedAt AS updatedAt`,
        { userId, origId: 'conv-e2e-123' }
      );
      if (initRes.records.length === 0) {
        throw new Error('Initial node for conv-e2e-123 not found in Neo4j. Check Scenario 1.');
      }
      oldNumMessages = initRes.records[0].get('numMessages') as number || 0;
      oldUpdatedAt = initRes.records[0].get('updatedAt') as string;
      console.log(
        `Initial node state for conv-e2e-123 (Neo4j): updatedAt=${oldUpdatedAt}, numMessages=${oldNumMessages}`
      );
    } finally {
      await neo4jSessionInit.close();
      await neo4jDriverInit.close();
    }

    try {
      const futureMs = Date.now() + 5000;
      const futureDate = new Date(futureMs);

      // [기존 데이터 업데이트] conv-e2e-123에 새로운 메시지 쌍 추가
      await db.collection('messages').insertMany([
        {
          _id: `msg-incremental-update-u-${Date.now()}`,
          conversationId: 'conv-e2e-123',
          ownerUserId: userId,
          role: 'user',
          content: 'I want to add more information about Graph Neural Networks.',
          createdAt: futureMs,
          updatedAt: futureMs,
        },
        {
          _id: `msg-incremental-update-a-${Date.now()}`,
          conversationId: 'conv-e2e-123',
          ownerUserId: userId,
          role: 'assistant',
          content: 'GNNs are powerful tools for processing structured graph data.',
          createdAt: futureMs + 1000,
          updatedAt: futureMs + 1000,
        },
      ] as any);

      await db
        .collection('conversations')
        .updateOne({ _id: 'conv-e2e-123' } as any, { $set: { updatedAt: futureMs + 2000 } });
      console.log('Updated existing conversation: conv-e2e-123 with new messages.');

      // [신규 대화 삽입]
      const newConvId = `conv-incremental-${Date.now()}`;
      await db.collection('conversations').insertOne({
        _id: newConvId,
        ownerUserId: userId,
        title: 'Incremental Test Chat',
        updatedAt: futureMs,
        createdAt: futureMs,
      } as any);

      await db.collection('messages').insertMany([
        {
          _id: `msg-incremental-user-${Date.now()}`,
          conversationId: newConvId,
          ownerUserId: userId,
          role: 'user',
          content: 'Adding a new conversation node for incremental testing.',
          createdAt: futureMs,
          updatedAt: futureMs,
        },
        {
          _id: `msg-incremental-assistant-${Date.now()}`,
          conversationId: newConvId,
          ownerUserId: userId,
          role: 'assistant',
          content: 'Incremental graph testing adds new nodes to an existing knowledge graph.',
          createdAt: futureMs + 1000,
          updatedAt: futureMs + 1000,
        },
      ] as any);

      // [신규 노트 삽입]
      const newNoteId = `note-incremental-${Date.now()}`;
      await db.collection('notes').insertOne({
        _id: newNoteId,
        ownerUserId: userId,
        title: 'Incremental Test Note',
        content: [
          '# Incremental Note',
          '',
          'This note was inserted for AddNode incremental testing.',
          '',
          '## Knowledge Graphs',
          '',
          'Knowledge graphs connect concepts extracted from both conversations and markdown notes.',
        ].join('\n'),
        deletedAt: null,
        createdAt: futureDate,
        updatedAt: futureDate,
      } as any);

      // AddNode API 호출
      const response = await apiClient.post('/v1/graph-ai/add-node');
      expect(response.status).toBe(202);

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

        // [기존 노드 업데이트 검증] conv-e2e-123
        const updatedNodeRes = await neo4jSession.run(
          `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
           WHERE n.origId = $origId AND n.deletedAt IS NULL
           RETURN n.id AS id, n.numMessages AS numMessages, n.updatedAt AS updatedAt`,
          { userId, origId: 'conv-e2e-123' }
        );

        expect(updatedNodeRes.records.length).toBe(1);
        const updatedNodeId = updatedNodeRes.records[0].get('id') as number;
        const updatedNumMessages = updatedNodeRes.records[0].get('numMessages') as number;
        const updatedUpdatedAt = updatedNodeRes.records[0].get('updatedAt') as string;

        console.log(
          `Updated node state for conv-e2e-123 (Neo4j): updatedAt=${updatedUpdatedAt}, numMessages=${updatedNumMessages}`
        );
        expect(updatedNumMessages).toBe(2);

        // [신규 대화 노드 생성 확인]
        const newConvNodeRes = await neo4jSession.run(
          `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
           WHERE n.origId = $origId AND n.deletedAt IS NULL
           RETURN n.id AS id, n.nodeType AS nodeType`,
          { userId, origId: newConvId }
        );
        expect(newConvNodeRes.records.length).toBe(1);
        const newConvNodeId = newConvNodeRes.records[0].get('id') as number;
        expect(typeof newConvNodeId).toBe('number');
        expect(newConvNodeRes.records[0].get('nodeType')).toBe('conversation');

        // [신규 노트 노드 생성 확인]
        const newNoteNodeRes = await neo4jSession.run(
          `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
           WHERE n.origId = $origId AND n.deletedAt IS NULL
           RETURN n.id AS id, n.nodeType AS nodeType`,
          { userId, origId: newNoteId }
        );
        expect(newNoteNodeRes.records.length).toBe(1);
        const newNoteNodeId = newNoteNodeRes.records[0].get('id') as number;
        expect(typeof newNoteNodeId).toBe('number');
        expect(newNoteNodeRes.records[0].get('nodeType')).toBe('note');

        console.log(
          `All verifications passed: existing node id=${updatedNodeId} updated, new conv node id=${newConvNodeId}, new note node id=${newNoteNodeId}.`
        );
      } finally {
        await neo4jSession.close();
        await neo4jDriver.close();
      }
    } finally {
      await mongoClient.close();
    }
  });

  it('Scenario 4: Graph Node Soft Delete Consistency Verification', async () => {
    console.log('\n--- Starting Scenario 4: Soft Delete Verification ---');

    if (!scenario1Passed) {
      throw new Error(
        'Scenario 1 did not complete successfully. Scenario 4 requires graph_nodes to be populated.'
      );
    }

    const neo4jDriver = createNeo4jE2eDriver();
    const neo4jSession = neo4jDriver.session();

    try {
      // 1. Neo4j에서 삭제할 활성 노드 선정
      const activeNodeRes = await neo4jSession.run(
        `MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
         WHERE n.deletedAt IS NULL
         RETURN n.id AS id, n.origId AS origId
         LIMIT 1`,
        { userId }
      );

      if (activeNodeRes.records.length === 0) {
        throw new Error('No active node found in Neo4j for testing deletion.');
      }

      const targetNodeId = activeNodeRes.records[0].get('id') as number;
      const targetOrigId = activeNodeRes.records[0].get('origId') as string;
      console.log(`Target node for deletion: id=${targetNodeId} (origId: ${targetOrigId})`);

      // 2. API를 통한 노드 소프트 삭제
      const response = await apiClient.delete(`/v1/graph/nodes/${targetNodeId}`);
      expect(response.status).toBe(204);

      // 3. Neo4j 검증 (deletedAt이 설정되었는지)
      const neo4jRes = await neo4jSession.run(
        'MATCH (n:MacroNode {userId: $userId, id: $id}) RETURN n.deletedAt AS deletedAt',
        { userId, id: targetNodeId }
      );
      expect(neo4jRes.records.length).toBe(1);
      const neo4jDeletedAt = neo4jRes.records[0].get('deletedAt');
      expect(neo4jDeletedAt).not.toBeNull();

      console.log('Soft Delete verified in Neo4j.');
    } finally {
      await neo4jSession.close();
      await neo4jDriver.close();
    }
  });
});
