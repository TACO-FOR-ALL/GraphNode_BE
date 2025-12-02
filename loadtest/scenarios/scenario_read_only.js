// loadtest/scenarios/scenario_read_only.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL } from '../common/config.js';
import { getAuthHeaders } from '../common/auth.js';

export const options = {
  stages: [
    { duration: '1m', target: 20 }, // 1분 동안 VU 20명까지 증가
    { duration: '4m', target: 20 }, // 4분 동안 VU 20명 유지
    { duration: '1m', target: 0 },  // 1분 동안 VU 0명으로 감소
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1500'], // 95%는 500ms, 99%는 1500ms 미만
    'http_req_failed': ['rate<0.01'], // 에러율 1% 미만
    'checks': ['rate>0.99'], // 성공률 99% 이상
  },
};

export default function () {
  const authHeaders = getAuthHeaders();

  group('Read-Only Scenario', function () {
    // 1. 내 정보 조회
    const meRes = http.get(`${BASE_URL}/v1/me`, authHeaders);
    check(meRes, { 'GET /v1/me - status is 200': (r) => r.status === 200 });
    sleep(1);

    // 2. 대화 목록 조회
    const convRes = http.get(`${BASE_URL}/v1/conversations`, authHeaders);
    check(convRes, { 'GET /v1/conversations - status is 200': (r) => r.status === 200 });
    sleep(1);

    // 3. 노트 목록 조회
    const notesRes = http.get(`${BASE_URL}/v1/notes`, authHeaders);
    check(notesRes, { 'GET /v1/notes - status is 200': (r) => r.status === 200 });
    sleep(1);

    // 4. 그래프 데이터 조회
    const graphRes = http.get(`${BASE_URL}/v1/graph`, authHeaders);
    check(graphRes, { 'GET /v1/graph - status is 200': (r) => r.status === 200 });
    sleep(2);
  });
}
