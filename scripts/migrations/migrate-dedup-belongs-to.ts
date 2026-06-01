/**
 * scripts/migrate-dedup-belongs-to.ts
 *
 * Neo4j MacroNode BELONGS_TO 중복 관계 정리 + Ghost Cluster 삭제 마이그레이션
 *
 * 동작:
 *  1. Neo4j에서 MacroGraph 노드 전체를 조회해 대상 userId 목록을 동적으로 추출
 *  2. 각 사용자에 대해 deduplicateBelongsTo → removeEmptyClusters 순으로 실행
 *  3. --dry-run 플래그 시 실제 DELETE 없이 영향 범위(카운트)만 출력
 *  4. 이미 정리된 DB에서 실행하면 변경 없이 빠르게 종료 (멱등성 보장)
 *
 * 실행 방법:
 *  node dist/scripts/migrate-dedup-belongs-to.js
 *  node dist/scripts/migrate-dedup-belongs-to.js --dry-run
 *  node dist/scripts/migrate-dedup-belongs-to.js --userId=<id>
 *
 * 환경변수 (직접 주입 또는 .env):
 *  NEO4J_URI      - neo4j+s://... 형식
 *  NEO4J_USERNAME
 *  NEO4J_PASSWORD
 */

import { initNeo4j, closeNeo4j, getNeo4jDriver } from '../../src/infra/db/neo4j';
import { Neo4jMacroGraphAdapter } from '../../src/infra/graph/Neo4jMacroGraphAdapter';

// ──────────────────────────────────────────────────────────────
// 인터페이스
// ──────────────────────────────────────────────────────────────

interface MigrationResult {
  userId: string;
  success: boolean;
  /** dry-run 시 삭제 예정 관계 수 */
  excessRelCount?: number;
  /** dry-run 시 중복 보유 노드 수 */
  duplicateNodeCount?: number;
  /** 실제 실행 시 삭제된 ghost cluster 판단을 위한 마커 */
  cleaned?: boolean;
  error?: string;
  durationMs: number;
}

// ──────────────────────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const singleUser = args.find((a) => a.startsWith('--userId='))?.split('=')[1];

  console.log('========================================================');
  console.log('  Neo4j BELONGS_TO Dedup Migration');
  console.log('========================================================');
  console.log(`모드: ${isDryRun ? '🔍 DRY RUN (읽기 전용)' : '🚀 실제 마이그레이션'}`);
  console.log(`Neo4j URI: ${process.env['NEO4J_URI'] ?? '(env 미설정)'}`);
  console.log('');

  // Neo4j 연결
  try {
    await initNeo4j();
    console.log('[Neo4j] 연결 성공');
  } catch (err) {
    console.error('[Neo4j] 연결 실패:', err);
    process.exit(1);
  }

  const adapter = new Neo4jMacroGraphAdapter();

  // 대상 userId 수집
  let userIds: string[];
  if (singleUser) {
    userIds = [singleUser];
    console.log(`대상 사용자: 단일 지정 → ${singleUser}`);
  } else {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const result = await session.run('MATCH (g:MacroGraph) RETURN g.userId AS userId');
      userIds = result.records.map((r: any) => String(r.get('userId') ?? '')).filter(Boolean);
    } finally {
      await session.close();
    }
    console.log(`대상 사용자: DB 동적 조회 → ${userIds.length}명`);
  }

  if (userIds.length === 0) {
    console.log('⚠️  대상 사용자 없음. 종료합니다.');
    await closeNeo4j();
    return;
  }

  console.log('');

  // 사용자별 마이그레이션 실행
  const results: MigrationResult[] = [];

  for (const userId of userIds) {
    const startMs = Date.now();
    const shortId = userId.slice(0, 8);
    console.log(`[${shortId}...] 시작`);

    try {
      if (isDryRun) {
        // dry-run: 카운트만 조회
        const { duplicateNodeCount, excessRelCount } =
          await adapter.countDuplicateBelongsTo(userId);

        const durationMs = Date.now() - startMs;

        if (duplicateNodeCount === 0) {
          console.log(`  ✅ 중복 없음 (${durationMs}ms)`);
        } else {
          console.log(
            `  ⚠️  중복 노드: ${duplicateNodeCount}개, 삭제 예정 관계: ${excessRelCount}개 (${durationMs}ms)`
          );
        }

        results.push({
          userId,
          success: true,
          duplicateNodeCount,
          excessRelCount,
          durationMs,
        });
      } else {
        // 실제 실행
        // 1단계: 중복 BELONGS_TO 정리
        await adapter.deduplicateBelongsTo(userId);

        // 2단계: Ghost Cluster 정리
        await adapter.removeEmptyClusters(userId);

        const durationMs = Date.now() - startMs;
        console.log(`  ✅ 완료 (${durationMs}ms)`);

        results.push({ userId, success: true, cleaned: true, durationMs });
      }
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ 실패: ${errorMessage}`);
      results.push({ userId, success: false, error: errorMessage, durationMs });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 결과 요약
  // ──────────────────────────────────────────────────────────────
  console.log('');
  console.log('========================================================');
  console.log('  마이그레이션 결과 요약');
  console.log('========================================================');

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  console.log(`성공: ${successes.length}명 / 실패: ${failures.length}명`);
  console.log('');

  if (isDryRun) {
    const totalDuplicateNodes = successes.reduce((s, r) => s + (r.duplicateNodeCount ?? 0), 0);
    const totalExcessRels = successes.reduce((s, r) => s + (r.excessRelCount ?? 0), 0);
    console.log(`[DRY RUN 요약]`);
    console.log(`  전체 중복 노드: ${totalDuplicateNodes}개`);
    console.log(`  전체 삭제 예정 BELONGS_TO: ${totalExcessRels}개`);
    console.log('');
    console.log('실제 정리를 실행하려면 --dry-run 플래그를 제거하세요.');
  } else {
    console.log('사용자별 상세:');
    for (const r of results) {
      const icon = r.success ? '✅' : '❌';
      const detail = r.success
        ? `정리 완료 (${r.durationMs}ms)`
        : `ERROR: ${r.error} (${r.durationMs}ms)`;
      console.log(`  ${icon} ${r.userId.slice(0, 8)}... → ${detail}`);
    }
  }

  if (failures.length > 0) {
    console.log('');
    console.log('⚠️  실패한 사용자는 아래 명령으로 재시도하세요:');
    failures.forEach((r) => console.log(`  --userId=${r.userId}`));
  }

  // 정리
  await closeNeo4j();
  console.log('');
  console.log('[완료] Neo4j 연결 종료');

  // 실패가 있으면 비-0 exit code로 CI에서 감지 가능
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
