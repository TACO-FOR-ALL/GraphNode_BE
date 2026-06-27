import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('SDK createWorkspace plan-limit contract', () => {
  const repoRoot = process.cwd();
  const docsPath = path.join(repoRoot, 'z_npm_sdk/docs/endpoints/microscope.md');
  const endpointPath = path.join(repoRoot, 'z_npm_sdk/src/endpoints/microscope.ts');
  const fixturePath = path.join(
    repoRoot,
    'tests/unit/fixtures/sdk-createWorkspace-plan-limit-contract.ts'
  );

  it('documents HTTP 402 PlanLimitExceededError and frontend upgrade CTA guidance', () => {
    const docs = fs.readFileSync(docsPath, 'utf8');
    const endpoint = fs.readFileSync(endpointPath, 'utf8');

    for (const content of [docs, endpoint]) {
      expect(content).toContain('402 Payment Required');
      expect(content).toContain('BM/plan limit exceeded');
      expect(content).toContain('PlanLimitExceededError');
      expect(content).toContain('CreateWorkspacePlanLimitExceededError');
      expect(content).toContain(
        'Frontends should show an upgrade CTA instead of retrying automatically.'
      );
    }

    expect(docs).toContain('`ingestFromNote(...)`');
    expect(docs).toContain('`ingestFromConversation(...)`');
    expect(docs).toContain('`ingestMultipleSources(...)`');
    expect(docs).toContain('201, 400, 401, 402, 502');
  });

  it('exposes HTTP 402 Payment Required PlanLimitExceededError for workspace creation limits', () => {
    const tsc = require.resolve('typescript/bin/tsc');

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
        fixturePath,
      ],
      { cwd: repoRoot, stdio: 'pipe' }
    );
  });
});
