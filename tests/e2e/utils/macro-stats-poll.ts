import { createNeo4jE2eDriver } from './neo4j-test-driver';

export type MacroStatsTargetStatus = 'CREATED' | 'UPDATED';

export interface PollMacroStatsOptions {
  /** 목표 MacroStats.status (기본 CREATED). */
  targetStatus?: MacroStatsTargetStatus;
  /** 최대 폴링 횟수 (기본: CI full E2E 180≈30분, 그 외 90). */
  maxAttempts?: number;
  /** 폴링 간격 ms (기본 10000). */
  intervalMs?: number;
  /** 로그 라벨 (디버깅용). */
  label?: string;
}

/**
 * @description Neo4j MacroStats.status가 목표값에 도달할 때까지 폴링합니다.
 * @param userId 테스트 사용자 ID.
 * @param options 폴링 옵션.
 * @returns 목표 status 도달 여부.
 */
export async function pollMacroStatsUntil(
  userId: string,
  options: PollMacroStatsOptions = {}
): Promise<boolean> {
  const targetStatus = options.targetStatus ?? 'CREATED';
  const scope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
  const defaultAttempts = scope === 'full' ? 180 : 90;
  const maxAttempts = options.maxAttempts ?? defaultAttempts;
  const intervalMs = options.intervalMs ?? 10_000;
  const label = options.label ?? `MacroStats→${targetStatus}`;

  const driver = createNeo4jE2eDriver();
  const session = driver.session();
  let sawUpdating = false;

  try {
    for (let i = 0; i < maxAttempts; i++) {
      const statsRes = await session.run(
        'MATCH (g:MacroGraph {userId: $userId})-[:HAS_STATS]->(st:MacroStats) RETURN st.status AS status',
        { userId }
      );
      const status = statsRes.records[0]?.get('status') as string | undefined;

      if (status === targetStatus) {
        // eslint-disable-next-line no-console
        console.log(`[E2E Poll] ${label} reached ${targetStatus} (${i * (intervalMs / 1000)}s)`);
        return true;
      }

      if (status === 'UPDATING') {
        sawUpdating = true;
      }

      // AddNode 실패 시 AI worker가 status를 CREATED로 되돌림 — 30분 타임아웃 대신 즉시 실패
      if (targetStatus === 'UPDATED' && sawUpdating && status === 'CREATED') {
        const detailRes = await session.run(
          `MATCH (g:MacroGraph {userId: $userId})-[:HAS_STATS]->(st:MacroStats)
           RETURN st.updatedAt AS updatedAt, st.generatedAt AS generatedAt, st.metadataJson AS metadataJson`,
          { userId }
        );
        const updatedAt = detailRes.records[0]?.get('updatedAt');
        const generatedAt = detailRes.records[0]?.get('generatedAt');
        const metadataRaw = detailRes.records[0]?.get('metadataJson') as string | undefined;
        let lastAddNodeError = 'none';
        if (metadataRaw) {
          try {
            const meta = JSON.parse(metadataRaw) as {
              lastAddNodeFailure?: { error?: string; taskId?: string };
            };
            if (meta.lastAddNodeFailure?.error) {
              lastAddNodeError = meta.lastAddNodeFailure.error;
            }
          } catch {
            lastAddNodeError = 'metadata parse failed';
          }
        }
        // eslint-disable-next-line no-console
        console.error(
          `[E2E Poll] ${label} failed: MacroStats reverted to CREATED after UPDATING (AddNode FAILED on AI/worker). ` +
            `lastAddNodeError=${lastAddNodeError}. ` +
            `Check e2e-logs/failure-summary.log (worker: "AddNode task failed", ai: add_node errors). ` +
            `MacroStats updatedAt=${String(updatedAt ?? 'none')} generatedAt=${String(generatedAt ?? 'none')}`
        );
        return false;
      }

      if (status === 'NOT_CREATED') {
        // eslint-disable-next-line no-console
        console.error(`[E2E Poll] ${label} failed: MacroStats NOT_CREATED`);
        return false;
      }

      if (i % 6 === 0) {
        // eslint-disable-next-line no-console
        console.log(`[E2E Poll] ${label} waiting... (${i * (intervalMs / 1000)}s, status=${status ?? 'none'})`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // eslint-disable-next-line no-console
    console.error(`[E2E Poll] ${label} timed out after ${(maxAttempts * intervalMs) / 1000}s`);
    return false;
  } finally {
    await session.close();
    await driver.close();
  }
}

/**
 * @description E2E에서 Ghost Cluster(MacroCluster without BELONGS_TO)를 Neo4j에서 제거합니다.
 * @param userId 테스트 사용자 ID.
 */
export async function purgeGhostClustersForE2e(userId: string): Promise<void> {
  const driver = createNeo4jE2eDriver();
  const session = driver.session();
  try {
    await session.run(
      `MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(c:MacroCluster {userId: $userId})
       WHERE NOT (c)<-[:BELONGS_TO]-()
       DETACH DELETE c`,
      { userId }
    );
  } finally {
    await session.close();
    await driver.close();
  }
}
