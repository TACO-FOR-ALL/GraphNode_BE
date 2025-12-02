// loadtest/common/config.example.js

/**
 * 이 파일은 config.js의 예시입니다.
 * 실제 테스트를 실행하기 전에 이 파일의 이름을 'config.js'로 변경하고,
 * 아래 값들을 실제 환경에 맞게 수정해야 합니다.
 *
 * 보안을 위해 실제 config.js 파일은 Git에 포함되지 않습니다.
 */

/**
 * 테스트에 사용될 기본 URL입니다.
 * k6 실행 시 환경변수(-e BASE_URL=...)로 주입하는 것을 권장합니다.
 */
export const BASE_URL = __ENV.BASE_URL || 'https://your-api-domain.com';

/**
 * 인증에 사용될 세션 쿠키입니다.
 * 미리 로그인하여 발급받은 'connect.sid' 값을 사용합니다.
 */
export const COOKIE = __ENV.K6_COOKIE || 'sid=...your-session-cookie...';

/**
 * DB 정리를 위한 접속 정보입니다.
 * 실제 값으로 수정하여 사용하세요.
 */
export const MYSQL_CONFIG = {
  url: __ENV.MYSQL_URL || 'mysql://user:password@host:port/database'
};

export const MONGODB_CONFIG = {
  url: __ENV.MONGODB_URL || 'mongodb://user:password@host:port',
  database: 'your_mongodb_database'
};
