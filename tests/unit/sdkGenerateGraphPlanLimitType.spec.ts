import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('SDK generateGraph plan-limit type contract', () => {
  it('exposes HTTP 402 Payment Required PlanLimitExceededError for generateGraph plan limits', () => {
    const tsc = require.resolve('typescript/bin/tsc');
    const fixture = path.join(
      process.cwd(),
      'tests/unit/fixtures/sdk-generateGraph-plan-limit-contract.ts'
    );

    execFileSync(
      process.execPath,
      [
        tsc,
        '--noEmit',
        '--target',
        'ES2020',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--strict',
        '--skipLibCheck',
        fixture,
      ],
      { cwd: process.cwd(), stdio: 'pipe' }
    );
  });
});
