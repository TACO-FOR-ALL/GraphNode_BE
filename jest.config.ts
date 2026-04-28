import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000, // 30 seconds
  collectCoverage: true,
  coverageDirectory: 'coverage',
  // CI 단위 테스트에서는 app layer coverage만 수집하고 coverage threshold는 별도 단계에서 관리합니다.
  collectCoverageFrom: ['src/app/**/*.{ts,js}'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/tests/**/*.spec.ts', '!**/tests/e2e/**'],
  // 기본 CI unit-test job은 DB 컨테이너 없이 실행되므로 MongoDB/Neo4j가 필요한 suite를 제외합니다.
  testPathIgnorePatterns: ['<rootDir>/tests/e2e/', '<rootDir>/tests/integration/'],
  // pdf-parse 계열 open handle을 강제로 정리하기 위해 기존 Jest forceExit 정책을 유지합니다.
  forceExit: true,
};

export default config;
