/**
 * scripts/sync-macro-graph.ts
 *
 * MongoDB → Neo4j Macro Graph 과거 데이터 일괄 마이그레이션 스크립트
 *
 * 동작:
 *  1. 대상 userId 목록의 MongoDB 데이터를 컬렉션별로 로드
 *  2. Neo4j의 upsertGraph 메서드를 통해 트랜잭션 단위로 저장
 *  3. --dry-run 플래그 시 실제 쓰기 없이 읽기 결과만 출력
 *
 * 실행 방법:
 *  npx ts-node scripts/sync-macro-graph.ts
 *  npx ts-node scripts/sync-macro-graph.ts --dry-run
 *  npx ts-node scripts/sync-macro-graph.ts --userId=<id>  (단일 사용자)
 *
 * 환경변수 (직접 주입 또는 .env):
 *  MONGODB_URL   - MongoDB connection string
 *  NEO4J_URI     - neo4j+s://... 형식
 *  NEO4J_USERNAME
 *  NEO4J_PASSWORD
 */

import neo4j from 'neo4j-driver';
import { MongoClient, Db } from 'mongodb';
import {
  GraphNodeDoc,
  GraphEdgeDoc,
  GraphClusterDoc,
  GraphSubclusterDoc,
  GraphStatsDoc,
  GraphSummaryDoc,
} from '../src/core/types/persistence/graph.persistence';
import { Neo4jMacroGraphAdapter } from '../src/infra/graph/Neo4jMacroGraphAdapter';
import { initNeo4j, closeNeo4j } from '../src/infra/db/neo4j';

// ──────────────────────────────────────────────────────────────
// 설정
// ──────────────────────────────────────────────────────────────

/**
 * 마이그레이션 대상 사용자 목록
 * prisma user 테이블 기준의 실 사용자 8명
 */
const TARGET_USER_IDS: string[] = [
  'ac4efcc3-f5a3-484e-a1cf-0ff4e472d864',
  'f4866e1c-4f56-4b61-8895-e50bcd4f45db',
  '34c7404e-64b5-46e2-951e-1a4dbf4a10b6',
  'e76a62be-de43-46dc-9a55-0498582fcfc8',
  'e8b3013f-1881-4a91-b250-8d0a6bb4f703',
  'fccc7e5e-de95-43b2-8d39-3f753f15cd24',
  'd2a7591a-d486-48ef-9949-d5efed91eafe',
  'bddd9c83-4256-48e1-a660-ae3844cbc610',
  '46d3d6c5-2a13-4e52-b069-ca5938095b5a',
];

const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'test';

// ──────────────────────────────────────────────────────────────
// 인터페이스 및 헬퍼
// ──────────────────────────────────────────────────────────────

interface MigrationResult {
  userId: string;
  success: boolean;
  nodes: number;
  edges: number;
  clusters: number;
  subclusters: number;
  hasSummary: boolean;
  error?: string;
  durationMs: number;
}

/** MongoDB에서 특정 사용자의 Macro Graph 전체 데이터를 로드합니다. */
async function loadUserGraphFromMongo(db: Db, userId: string) {
  const [nodes, edges, clusters, subclusters, statsArr, summaryArr] = await Promise.all([
    db.collection<GraphNodeDoc>('graph_nodes').find({ userId }).toArray(),
    db.collection<GraphEdgeDoc>('graph_edges').find({ userId }).toArray(),
    db.collection<GraphClusterDoc>('graph_clusters').find({ userId }).toArray(),
    db.collection<GraphSubclusterDoc>('graph_subclusters').find({ userId }).toArray(),
    db.collection<GraphStatsDoc>('graph_stats').find({ userId }).toArray(),
    db.collection<GraphSummaryDoc>('graph_summaries').find({ userId }).toArray(),
  ]);

  const stats = statsArr[0] ?? null;
  const summary = summaryArr[0] ?? undefined;

  return { nodes, edges, clusters, subclusters, stats, summary };
}

// ──────────────────────────────────────────────────────────────
// 메인 실행 로직
// ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const singleUser = args.find((a) => a.startsWith('--userId='))?.split('=')[1];

  const targetUsers = singleUser ? [singleUser] : TARGET_USER_IDS;

  console.log('========================================');
  console.log('  MongoDB → Neo4j Macro Graph Migration');
  console.log('========================================');
  console.log(`모드: ${isDryRun ? '🔍 DRY RUN (읽기 전용)' : '🚀 실제 마이그레이션'}`);
  console.log(`대상 사용자: ${targetUsers.length}명`);
  console.log(`Neo4j URI: ${process.env.NEO4J_URI ?? '(env)'}`);
  console.log(`MongoDB: ${MONGODB_URL}/${MONGODB_DB}`);
  console.log('');

  // MongoDB 연결
  const mongoClient = new MongoClient(MONGODB_URL);
  await mongoClient.connect();
  const db = mongoClient.db(MONGODB_DB);
  console.log('[MongoDB] 연결 성공');

  // --- DEBUG: 환경 변수 주입 상태 확인 ---
  console.log('\n[DEBUG] Neo4j Auth Environment Variables:');
  console.log('  - URI:', process.env.NEO4J_URI);
  console.log('  - USER:', process.env.NEO4J_USERNAME);
  console.log('  - PASSWORD (length):', process.env.NEO4J_PASSWORD?.length);
  if (process.env.NEO4J_PASSWORD) {
    // 비밀번호의 첫 글자와 마지막 글자만 출력하여 실제 값인지 확인 (보안 유지)
    const p = process.env.NEO4J_PASSWORD;
    console.log(`  - PASSWORD  ${p}`);
  }
  console.log('--------------------------------------\n');

  // Neo4j 공용 드라이버 초기화 — getNeo4jDriver()가 반환할 전역 driver를 등록합니다.
  // initNeo4j()는 loadEnv()로 NEO4J_* 환경변수를 읽고, verifyConnectivity() 및
  // ensureNeo4jSchema()를 실행한 뒤 전역 driver 변수에 할당합니다.
  try {
    await initNeo4j();
    console.log('[Neo4j] 연결 성공');
  } catch (err) {
    console.error('[Neo4j] 연결 실패:', err);
    await mongoClient.close();
    process.exit(1);
  }

  // Neo4j Adapter 초기화 — 위에서 등록된 전ㅛ역 driver를 getNeo4jDriver()로 참조합니다.
  const adapter = new Neo4jMacroGraphAdapter();

  // 각 사용자 마이그레이션 실행
  const results: MigrationResult[] = [];

  for (const userId of targetUsers) {
    const startMs = Date.now();
    console.log(`\n[${userId}] 마이그레이션 시작...`);

    try {
      // 1. MongoDB에서 데이터 로드
      const { nodes, edges, clusters, subclusters, stats, summary } = await loadUserGraphFromMongo(
        db,
        userId
      );

      console.log(
        `  MongoDB: nodes=${nodes.length}, edges=${edges.length}, clusters=${clusters.length}, ` +
          `subclusters=${subclusters.length}, hasStats=${!!stats}, hasSummary=${!!summary}`
      );

      // stats 없으면 스킵 (그래프 자체가 없는 사용자)
      if (!stats || stats.status === 'NOT_CREATED') {
        console.log(`  ⏭️  status=NOT_CREATED 또는 stats 없음 → 스킵`);
        results.push({
          userId,
          success: true,
          nodes: 0,
          edges: 0,
          clusters: 0,
          subclusters: 0,
          hasSummary: false,
          durationMs: Date.now() - startMs,
        });
        continue;
      }

      if (isDryRun) {
        console.log(`  ✅ DRY RUN: 위 데이터를 Neo4j에 저장할 예정 (실제 쓰기 없음)`);
        results.push({
          userId,
          success: true,
          nodes: nodes.length,
          edges: edges.length,
          clusters: clusters.length,
          subclusters: subclusters.length,
          hasSummary: !!summary,
          durationMs: Date.now() - startMs,
        });
        continue;
      }

      // 2. Neo4j에 upsert (cluster 선행 보장을 위해 upsertGraph 사용)
      // upsertGraph는 내부적으로 purgeUserData → 재구성 순서를 보장합니다.
      const result = await adapter.upsertGraph({
        userId,
        nodes,
        edges,
        clusters,
        subclusters,
        stats,
        summary,
      });

      const durationMs = Date.now() - startMs;
      console.log(
        `  ✅ 완료: nodes=${result.nodes}, edges=${result.edges}, ` +
          `clusters=${result.clusters}, subclusters=${result.subclusters} (${durationMs}ms)`
      );

      results.push({
        userId,
        success: true,
        nodes: result.nodes,
        edges: result.edges,
        clusters: result.clusters,
        subclusters: result.subclusters,
        hasSummary: result.summary,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ 실패: ${errorMessage}`);
      results.push({
        userId,
        success: false,
        nodes: 0,
        edges: 0,
        clusters: 0,
        subclusters: 0,
        hasSummary: false,
        error: errorMessage,
        durationMs,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 결과 리포트
  // ──────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  마이그레이션 결과 요약');
  console.log('========================================');

  const success = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`성공: ${success.length}명 / 실패: ${failed.length}명\n`);

  console.log('사용자별 상세:');
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    const detail = r.success
      ? `nodes=${r.nodes}, edges=${r.edges}, clusters=${r.clusters}, subclusters=${r.subclusters}, summary=${r.hasSummary} (${r.durationMs}ms)`
      : `ERROR: ${r.error}`;
    console.log(`  ${icon} ${r.userId.slice(0, 8)}... → ${detail}`);
  }

  if (failed.length > 0) {
    console.log('\n⚠️  실패한 사용자는 아래 ID를 --userId 옵션으로 재시도하세요:');
    failed.forEach((r) => console.log(`  --userId=${r.userId}`));
  }

  // 정리
  await mongoClient.close();
  await closeNeo4j();
  console.log('\n[완료] 모든 연결 종료');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
