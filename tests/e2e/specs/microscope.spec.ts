import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { isE2eFullSuiteEnabled, e2eFullSuiteSkipReason } from '../utils/e2e-llm-env';
import { seedTestData } from '../utils/db-seed';
import { MongoClient } from 'mongodb';

/**
 * Microscope 엔드투엔드(E2E) 테스트 스펙
 *
 * 시나리오 3: Microscope 분석 인입 (Microscope Ingest)
 * - 특정 노드를 기반으로 심층 분석 워크스페이스를 생성하고,
 *   AI가 문서 분석을 완료하여 'COMPLETED' 상태가 되는지 검증합니다.
 *
 * 시나리오 4: Microscope Block View 통합 검증
 * - 듀얼 SQS 파이프라인(block + nonblock)이 모두 완료된 후
 *   GET graph API가 blockView 필드를 포함하여 반환하는지 검증합니다.
 *
 * E2E_SCOPE=full + LLM 키 있을 때만 실행.
 *
 * ⚠️ 로컬 실행 불가 — 외부 CI 환경(실제 SQS + AI Worker)에서 실행되어야 합니다.
 *    실패 시 handoff 문서를 참조하세요: docs/e2e-handoff/microscope-block-view.md
 */
function describeMicroscope(title: string, fn: () => void): void {
  const enabled = isE2eFullSuiteEnabled();
  const block = enabled ? describe : describe.skip;
  block(enabled ? title : e2eFullSuiteSkipReason() || title, fn);
}

describeMicroscope('End-to-End Microscope Flow', () => {
  const userId = getTestUserId();
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';

  beforeAll(async () => {
    await seedTestData();
  });

  it('Scenario 3: Microscope Ingest from Note', async () => {
    console.log('\n--- Starting Scenario 3: Microscope Ingest ---');

    const payload = {
      nodeId: 'note-e2e-123',
      nodeType: 'note',
      schemaName: 'test_schema',
    };

    const response = await apiClient.post('/v1/microscope/nodes/ingest', payload);
    expect(response.status).toBe(201);

    const workspaceId = response.data._id;
    const docId = response.data.documents[0].id;
    console.log(`Microscope Task Enqueued: ${docId} in Workspace: ${workspaceId}`);

    let isFinished = false;
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      for (let i = 0; i < 60; i++) {
        const workspace = await db.collection('microscope_workspaces').findOne({ _id: workspaceId });
        const doc = workspace?.documents.find((d: any) => d.id === docId);

        // 듀얼 SQS 모드: block + nonBlock 양쪽 완료 시 status = 'COMPLETED'
        if (doc && doc.status === 'COMPLETED') {
          isFinished = true;
          break;
        } else if (doc && doc.status === 'FAILED') {
          throw new Error(`Microscope ingest failed: ${doc.error}`);
        }
        if (i % 6 === 0)
          process.stdout.write(`\n--- Waiting for microscope ingest... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nMicroscope ingest confirmed in DB.');
  });

  it('Scenario 4a: Dual SQS — block + nonBlock sub-status tracking', async () => {
    console.log('\n--- Starting Scenario 4a: Dual SQS Sub-Status Tracking ---');

    const payload = {
      nodeId: 'note-e2e-block-123',
      nodeType: 'note',
      schemaName: 'test_schema',
    };

    const response = await apiClient.post('/v1/microscope/nodes/ingest', payload);
    expect(response.status).toBe(201);

    const workspaceId = response.data._id;
    const docId = response.data.documents[0].id;

    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      // 초기 상태: blockStatus, nonBlockStatus 모두 PROCESSING
      const initWs = await db.collection('microscope_workspaces').findOne({ _id: workspaceId });
      const initDoc = initWs?.documents.find((d: any) => d.id === docId);

      expect(initDoc).toBeDefined();
      expect(initDoc.blockStatus).toBe('PROCESSING');
      expect(initDoc.nonBlockStatus).toBe('PROCESSING');
      expect(initDoc.blockModeRequested).toBe(true);
      console.log('Dual SQS sub-status initialized correctly.');

      // 전체 완료 대기 (최대 15분)
      let isCompleted = false;
      for (let i = 0; i < 90; i++) {
        const freshWs = await db.collection('microscope_workspaces').findOne({ _id: workspaceId });
        const freshDoc = freshWs?.documents.find((d: any) => d.id === docId);

        if (freshDoc?.status === 'COMPLETED') {
          isCompleted = true;
          expect(freshDoc.blockStatus).toBe('COMPLETED');
          expect(freshDoc.nonBlockStatus).toBe('COMPLETED');
          console.log('Both block and nonBlock pipelines completed.');
          break;
        } else if (freshDoc?.status === 'FAILED') {
          throw new Error(`Dual microscope ingest failed: ${freshDoc.error}`);
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting dual pipeline... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      expect(isCompleted).toBe(true);
    } finally {
      await mongoClient.close();
    }
  });

  it('Scenario 4b: GET graph returns blockView after dual pipeline completion', async () => {
    console.log('\n--- Starting Scenario 4b: Block View Graph API ---');

    const payload = {
      nodeId: 'note-e2e-blockview-456',
      nodeType: 'note',
      schemaName: 'test_schema',
    };

    const ingestResp = await apiClient.post('/v1/microscope/nodes/ingest', payload);
    expect(ingestResp.status).toBe(201);

    const workspaceId = ingestResp.data._id;
    const docId = ingestResp.data.documents[0].id;

    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();
    let isCompleted = false;

    try {
      for (let i = 0; i < 90; i++) {
        const ws = await db.collection('microscope_workspaces').findOne({ _id: workspaceId });
        const doc = ws?.documents.find((d: any) => d.id === docId);

        if (doc?.status === 'COMPLETED') { isCompleted = true; break; }
        if (doc?.status === 'FAILED') throw new Error(`Ingest failed: ${doc.error}`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isCompleted).toBe(true);

    // GET /v1/microscope/:workspaceId/graph — blockView 포함 여부 검증
    const graphResp = await apiClient.get(`/v1/microscope/${workspaceId}/graph`);
    expect(graphResp.status).toBe(200);

    const graphData = graphResp.data;
    expect(Array.isArray(graphData)).toBe(true);
    expect(graphData.length).toBeGreaterThan(0);

    const firstGraph = graphData[0];

    // non-block 필드 검증
    expect(Array.isArray(firstGraph.nodes)).toBe(true);
    expect(Array.isArray(firstGraph.edges)).toBe(true);

    // block view 검증
    expect(firstGraph.blockView).toBeDefined();
    expect(Array.isArray(firstGraph.blockView.blocks)).toBe(true);
    expect(firstGraph.blockView.blocks.length).toBeGreaterThan(0);

    const firstBlock = firstGraph.blockView.blocks[0];
    expect(firstBlock).toHaveProperty('block_id');
    expect(firstBlock).toHaveProperty('title');
    expect(Array.isArray(firstBlock.key_concepts)).toBe(true);
    expect(firstBlock).toHaveProperty('micro_graph');
    expect(Array.isArray(firstBlock.micro_graph.nodes)).toBe(true);
    expect(Array.isArray(firstBlock.micro_graph.edges)).toBe(true);

    expect(Array.isArray(firstGraph.blockView.edges)).toBe(true);
    expect(Array.isArray(firstGraph.blockView.paths)).toBe(true);

    const validEdgeTypes = ['PREREQUISITE_OF', 'FOLLOWS', 'ELABORATES', 'CONTRASTS', 'PARALLEL'];
    for (const edge of firstGraph.blockView.edges) {
      expect(validEdgeTypes).toContain(edge.type);
    }

    console.log(
      `Block View verified: ${firstGraph.blockView.blocks.length} blocks, ` +
      `${firstGraph.blockView.edges.length} edges, ` +
      `${firstGraph.blockView.paths.length} paths`
    );
  });

  it('Scenario 4c: getLatestGraphByNodeId returns blockView', async () => {
    console.log('\n--- Starting Scenario 4c: getLatestGraphByNodeId with blockView ---');

    const nodeId = 'note-e2e-latestgraph-789';
    const payload = { nodeId, nodeType: 'note', schemaName: 'test_schema' };

    const ingestResp = await apiClient.post('/v1/microscope/nodes/ingest', payload);
    expect(ingestResp.status).toBe(201);
    const workspaceId = ingestResp.data._id;
    const docId = ingestResp.data.documents[0].id;

    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();
    let isCompleted = false;

    try {
      for (let i = 0; i < 90; i++) {
        const ws = await db.collection('microscope_workspaces').findOne({ _id: workspaceId });
        const doc = ws?.documents.find((d: any) => d.id === docId);
        if (doc?.status === 'COMPLETED') { isCompleted = true; break; }
        if (doc?.status === 'FAILED') throw new Error(`Ingest failed: ${doc.error}`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isCompleted).toBe(true);

    // GET /v1/microscope/nodes/:nodeId/latest-graph — blockView 포함 확인
    const graphResp = await apiClient.get(`/v1/microscope/nodes/${nodeId}/latest-graph`);
    expect(graphResp.status).toBe(200);

    const graphData = graphResp.data;
    expect(graphData).toHaveProperty('nodes');
    expect(graphData).toHaveProperty('edges');
    expect(graphData).toHaveProperty('blockView');
    expect(graphData.blockView.blocks.length).toBeGreaterThan(0);

    console.log('getLatestGraphByNodeId returns blockView correctly.');
  });
});
