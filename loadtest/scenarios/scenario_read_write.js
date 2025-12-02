// loadtest/scenarios/scenario_read_write.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL } from '../common/config.js';
import { getAuthHeaders } from '../common/auth.js';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  stages: [
    { duration: '1m', target: 10 }, // 쓰기 부하는 Read보다 낮게 설정
    { duration: '4m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<800', 'p(99)<2000'],
    'http_req_failed': ['rate<0.01'],
    'checks': ['rate>0.99'],
  },
};

export default function () {
  const authHeaders = getAuthHeaders();
  const noteTitle = `[k6-test] Note ${randomString(10)}`;
  const noteContent = `This is a test note created by k6 at ${new Date().toISOString()}`;
  let noteId = null;

  group('Read & Write Scenario', function () {
    // 1. 내 정보 조회 (인증 확인)
    const meRes = http.get(`${BASE_URL}/v1/me`, authHeaders);
    check(meRes, { 'GET /v1/me - status is 200': (r) => r.status === 200 });
    sleep(1);

    // 2. 새 노트 생성
    const createNoteRes = http.post(
      `${BASE_URL}/v1/notes`,
      JSON.stringify({
        title: noteTitle,
        content: noteContent,
      }),
      {
        headers: {
          ...authHeaders.headers,
          'Content-Type': 'application/json',
        },
      }
    );
    check(createNoteRes, {
      'POST /v1/notes - status is 201': (r) => r.status === 201,
      'POST /v1/notes - response has id': (r) => r.json('id') !== null,
    });

    if (createNoteRes.status === 201) {
      noteId = createNoteRes.json('id');
    }
    sleep(2);

    // 3. 생성된 노트 조회
    if (noteId) {
      const getNoteRes = http.get(`${BASE_URL}/v1/notes/${noteId}`, authHeaders);
      check(getNoteRes, {
        'GET /v1/notes/:id - status is 200': (r) => r.status === 200,
        'GET /v1/notes/:id - title is correct': (r) => r.json('title') === noteTitle,
      });
    }
    sleep(2);
  });
}
