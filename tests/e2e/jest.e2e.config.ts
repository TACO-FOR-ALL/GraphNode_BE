import type { Config } from 'jest';
import baseConfig from '../../jest.config';

const config: Config = {
  ...baseConfig,
  testMatch: ['**/tests/e2e/**/*.spec.ts'],
  setupFilesAfterEnv: [], // E2E tests might not need the same setup
  testTimeout: 3600000, // 60 minutes - E2E tests involving AI can be very slow
  collectCoverage: false, // Don't care about coverage for E2E
};

export default config;
