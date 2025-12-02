// loadtest/scenarios/scenario_heavy_read.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL } from '../common/config.js';
import { getAuthHeaders } from '../common/auth.js';

export const options = {
  stages: [
    { duration: '1m', target: 15 },
    { duration: '4m', target: 15 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000', 'p(99)<2500'],
    'http_req_failed': ['rate<0.02'], // 부하가 높으므로 에러율을 조금 더 허용
    'checks': ['rate>0.98'],
  },
};

// 테스트 전에 미리 조회할 대화 ID 목록을 준비합니다.
// 실제 테스트에서는 더 많은 ID를 채워넣어야 합니다.
const conversationIds = [
  // 여기에 실제 존재하는 대화 ID를 채워주세요.
  // 예: 'conv_xxxxxxxx', 'conv_yyyyyyyy'
];

export default function () {
  if (conversationIds.length === 0) {
    console.error("Heavy-Read 시나리오를 실행하려면 conversationIds 배열을 채워야 합니다.");
    return;
  }

  const authHeaders = getAuthHeaders();
  const randomConvId = conversationIds[Math.floor(Math.random() * conversationIds.length)];

  group('Heavy-Read Scenario', function () {
    // 1. 내 정보 조회
    const meRes = http.get(`${BASE_URL}/v1/me`, authHeaders);
    check(meRes, { 'GET /v1/me - status is 200': (r) => r.status === 200 });
    sleep(1);

    // 2. 특정 대화 상세 조회 (메시지 포함)
    const convDetailRes = http.get(`${BASE_URL}/v1/conversations/${randomConvId}`, authHeaders);
    check(convDetailRes, { 'GET /v1/conversations/:id - status is 200': (r) => r.status === 200 });
    sleep(2);

    // 3. 그래프 데이터 조회
    const graphRes = http.get(`${BASE_URL}/v1/graph`, authHeaders);
    check(graphRes, { 'GET /v1/graph - status is 200': (r) => r.status === 200 });
    sleep(3);
  });
}
