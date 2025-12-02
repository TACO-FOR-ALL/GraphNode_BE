// loadtest/common/auth.js
import { COOKIE } from './config.js';

/**
 * 인증이 필요한 k6 요청에 사용할 헤더 객체를 반환합니다.
 * config.js에 정의된 세션 쿠키를 사용합니다.
 * @returns {object} 'Cookie'를 포함하는 헤더 객체
 */
export function getAuthHeaders() {
  return {
    headers: {
      'Cookie': COOKIE,
    },
  };
}
