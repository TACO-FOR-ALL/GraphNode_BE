import { describe } from '@jest/globals';

/**
 * @description import-* 스펙 경로로 Jest가 실행되면 env 전달(WSL/Windows) 문제와 무관하게 import scope 적용.
 */
export function resolveE2eScope(): string {
  const argv = process.argv.join(' ');
  if (/tests[/\\]e2e[/\\]specs[/\\]import-/i.test(argv)) {
    return 'import';
  }
  return (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
}

/**
 * E2E_SCOPE=import 일 때만 import 스펙 실행. bundle/full 에서는 skip.
 */
export function describeImportE2e(title: string, fn: () => void): void {
  const scope = resolveE2eScope();
  const enabled = scope === 'import' || scope === 'full';
  const block = enabled ? describe : describe.skip;
  block(enabled ? title : `${title} (skipped: E2E_SCOPE=${scope})`, fn);
}

export function isImportE2eEnabled(): boolean {
  const scope = resolveE2eScope();
  return scope === 'import' || scope === 'full';
}
