import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000, // 30 seconds
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: { global: { lines: 80, branches: 70, functions: 80, statements: 80 } },
  collectCoverageFrom: ['src/app/**/*.{ts,js}'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/tests/**/*.spec.ts']
};

export default config;
