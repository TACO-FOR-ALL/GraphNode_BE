import axios from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'ci-test-key';
const TEST_USER_ID = 'user-12345';

/**
 * E2E 테스트용 공통 API 클라이언트 유틸리티
 * 
 * 역할: 
 * 1. 기초 URL(localhost:3000) 및 공통 헤더 설정
 * 2. 내부 서비스 인증 우회를 위해 'x-internal-token' 및 'x-user-id' 헤더를 자동 삽입
 * 3. 4xx/5xx 에러 발생 시에도 예외를 던지지 않고 응답 객체를 반환하여 테스트 코드에서 상태 코드를 직접 검증 가능하게 함 (validateStatus)
 */
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-token': INTERNAL_TOKEN,
    'x-user-id': TEST_USER_ID,
  },
  validateStatus: () => true, // 모든 HTTP 상태 코드를 에러 없이 반환받아 테스트 목적에 맞게 검증
});

/**
 * 테스트에 사용되는 고정 유저 ID를 반환합니다.
 */
export const getTestUserId = () => TEST_USER_ID;
