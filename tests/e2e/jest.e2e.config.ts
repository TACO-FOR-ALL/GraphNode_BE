import type { Config } from 'jest';
import baseConfig from '../../jest.config';

const config: Config = {
  ...baseConfig,
  // Docker 기반 통합 워크플로우에서는 DB가 준비되어 있으므로 E2E와 migration consistency suite를 함께 실행합니다.
  testMatch: ['**/tests/e2e/**/*.spec.ts', '**/tests/integration/migration/**/*.spec.ts'],
  testPathIgnorePatterns: [],
  setupFilesAfterEnv: [], // E2E tests might not need the same setup
  testTimeout: 3600000, // 60 minutes - E2E tests involving AI can be very slow
  collectCoverage: false, // Don't care about coverage for E2E
};

export default config;
