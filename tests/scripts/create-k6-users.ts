/* eslint-disable no-console */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import prisma from '../../src/infra/db/prisma';
import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

interface K6UserRecord {
  userId: string;
  providerUserId: string;
  email: string;
}

function toPaddedNumber(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

async function main() {
  const count = Number(process.env.K6_USERS_COUNT ?? 1000);
  const prefix = process.env.K6_USERS_PREFIX ?? 'k6-user';
  const domain = process.env.K6_USERS_EMAIL_DOMAIN ?? 'load.local';
  const provider = 'dev' as const;

  if (!Number.isFinite(count) || count <= 0) {
    throw new Error('K6_USERS_COUNT must be a positive number');
  }

  console.log(`[k6-users] start: count=${count}, prefix=${prefix}, provider=${provider}`);

  await prisma.$connect();
  const repo = new UserRepositoryMySQL();
  const result: K6UserRecord[] = [];

  try {
    for (let i = 1; i <= count; i += 1) {
      const seq = toPaddedNumber(i, 6);
      const providerUserId = `${prefix}-${seq}`;
      const email = `${providerUserId}@${domain}`;

      const user = await repo.findOrCreateFromProvider({
        provider,
        providerUserId,
        email,
        displayName: providerUserId,
        avatarUrl: null,
      });

      result.push({
        userId: user.id,
        providerUserId,
        email,
      });

      if (i % 100 === 0 || i === count) {
        console.log(`[k6-users] progress: ${i}/${count}`);
      }
    }

    const outputPath =
      process.env.K6_USERS_OUTPUT_PATH ??
      path.resolve(__dirname, '../../../k6-test/users.json');
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');

    console.log(`[k6-users] done: wrote ${result.length} users to ${outputPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[k6-users] failed:', err);
  process.exit(1);
});
