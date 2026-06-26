import fs from 'node:fs';
import path from 'node:path';

describe('SDK generateGraph plan-limit documentation contract', () => {
  const repoRoot = process.cwd();
  const docsPath = path.join(repoRoot, 'z_npm_sdk/docs/endpoints/graphAi.md');
  const endpointPath = path.join(repoRoot, 'z_npm_sdk/src/endpoints/graphAi.ts');

  it('documents HTTP 402 PlanLimitExceededError and frontend upgrade CTA guidance', () => {
    const docs = fs.readFileSync(docsPath, 'utf8');
    const endpoint = fs.readFileSync(endpointPath, 'utf8');

    for (const content of [docs, endpoint]) {
      expect(content).toContain('402 Payment Required');
      expect(content).toContain('BM/plan limit exceeded');
      expect(content).toContain('PlanLimitExceededError');
      expect(content).toContain('GenerateGraphPlanLimitExceededError');
      expect(content).toContain(
        'Frontends should show an upgrade CTA instead of retrying automatically.'
      );
    }
  });
});
