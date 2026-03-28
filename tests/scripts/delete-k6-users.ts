/* eslint-disable no-console */
import { unlink } from 'fs/promises';
import path from 'path';

import prisma from '../../src/infra/db/prisma';

/**
 * k6 테스트 사용자 정리 스크립트
 *
 * 기본 정책:
 * - provider='dev'
 * - providerUserId가 K6_USERS_PREFIX(기본 k6-user-)로 시작하는 사용자만 삭제
 *
 * 주의:
 * - 운영 데이터 보호를 위해 prefix 조건을 강제한다.
 * - 필요 시 K6_USERS_PREFIX를 환경변수로 명시적으로 지정해서 사용한다.
 */
async function main() {
  const provider = 'dev';
  const rawPrefix = process.env.K6_USERS_PREFIX ?? 'k6-user';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix : `${rawPrefix}-`;
  const unlinkOutput = process.env.K6_USERS_UNLINK_OUTPUT === 'true';
  const outputPath =
    process.env.K6_USERS_OUTPUT_PATH ??
    path.resolve(__dirname, '../../../k6-test/users.json');

  console.log(`[k6-users:delete] start: provider=${provider}, prefix=${prefix}`);
  await prisma.$connect();

  try {
    const targets = await prisma.user.findMany({
      where: {
        provider,
        providerUserId: { startsWith: prefix },
      },
      select: {
        id: true,
      },
    });

    if (targets.length === 0) {
      console.log('[k6-users:delete] no users matched.');
      return;
    }

    const ids = targets.map((u) => u.id);
    const result = await prisma.user.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    console.log(`[k6-users:delete] deleted users: ${result.count}`);

    if (unlinkOutput) {
      try {
        await unlink(outputPath);
        console.log(`[k6-users:delete] removed output file: ${outputPath}`);
      } catch {
        // 파일이 없어도 실패로 보지 않는다.
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[k6-users:delete] failed:', err);
  process.exit(1);
});
