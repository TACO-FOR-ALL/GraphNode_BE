/**
 * E2E 시나리오: 매크로 뷰 통합 플로우
 *
 * ⚠️  로컬 실행 금지 — 전체 인프라(Neo4j, Redis, SQS, S3) 기동 필요
 * 시나리오 코드 작성만 허용됩니다.
 *
 * 커버 시나리오:
 * 1. 1:N 그래프 생성 (scopeFilter 제공) — POST /v1/graph-ai/generate
 * 2. 생성된 뷰 목록 조회 — GET /v1/graph/graphs
 * 3. 단건 조회 — GET /v1/graph/graphs/:macroId
 * 4. 메타데이터 수정 — PATCH /v1/graph/graphs/:macroId
 * 5. Deep Clone — POST /v1/graph/graphs/:macroId/clone
 * 6. 소프트 삭제 — DELETE /v1/graph/graphs/:macroId
 * 7. 복원 — POST /v1/graph/graphs/:macroId/restore
 * 8. 레거시 1:1 모드 하위 호환 — scopeFilter 없이 POST /v1/graph-ai/generate
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient } from '../utils/api-client';

// E2E 플로우에서 공유되는 상태
let createdMacroId: string;
let clonedMacroId: string;

beforeAll(async () => {
  createdMacroId = '';
  clonedMacroId = '';
});

describe('시나리오 1: 1:N 그래프 생성 (manual scopeFilter)', () => {
  it('POST /v1/graph-ai/generate — scopeFilter=manual 로 새 macroId 발급', async () => {
    const res = await apiClient.post('/v1/graph-ai/generate', {
      includeSummary: false,
      title: 'E2E 테스트 뷰',
      description: '최근 1개월 채팅/노트 기반 뷰',
      scopeFilter: {
        mode: 'manual',
        filters: { dataTypes: ['chat', 'note'], createdPeriod: '1m' },
      },
    });

    expect(res.status).toBe(202);
    expect(res.data.status).toBe('queued');
    expect(typeof res.data.taskId).toBe('string');
  });
});

describe('시나리오 2: 매크로 뷰 목록 조회', () => {
  it('GET /v1/graph/graphs — 활성 뷰 목록을 반환한다', async () => {
    const res = await apiClient.get('/v1/graph/graphs?onlyDeleted=false');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.graphs)).toBe(true);

    if ((res.data.graphs as Array<{ macroId: string }>).length > 0) {
      createdMacroId = (res.data.graphs as Array<{ macroId: string }>)[0].macroId;
      expect(typeof createdMacroId).toBe('string');
    }
  });

  it('onlyDeleted=true로 휴지통만 조회한다', async () => {
    const res = await apiClient.get('/v1/graph/graphs?onlyDeleted=true');
    expect(res.status).toBe(200);
    (res.data.graphs as Array<{ deletedAt: unknown }>).forEach((v) =>
      expect(v.deletedAt).toBeTruthy()
    );
  });
});

describe('시나리오 3: 단건 조회', () => {
  it('GET /v1/graph/graphs/:macroId — 단건 조회', async () => {
    if (!createdMacroId) return;

    const res = await apiClient.get(`/v1/graph/graphs/${createdMacroId}`);
    expect(res.status).toBe(200);
    expect(res.data.graph.macroId).toBe(createdMacroId);
  });

  it('존재하지 않는 macroId는 404를 반환한다', async () => {
    const res = await apiClient.get('/v1/graph/graphs/NONEXISTENT_MAC');
    expect(res.status).toBe(404);
  });
});

describe('시나리오 4: 메타데이터 수정', () => {
  it('PATCH /v1/graph/graphs/:macroId — 제목을 수정한다', async () => {
    if (!createdMacroId) return;

    const res = await apiClient.patch(`/v1/graph/graphs/${createdMacroId}`, {
      title: 'E2E 수정된 제목',
    });
    expect(res.status).toBe(200);
    expect(res.data.graph.title).toBe('E2E 수정된 제목');
  });
});

describe('시나리오 5: Deep Clone', () => {
  it('POST /v1/graph/graphs/:macroId/clone — 새 macroId로 복제된다', async () => {
    if (!createdMacroId) return;

    const res = await apiClient.post(`/v1/graph/graphs/${createdMacroId}/clone`);
    expect(res.status).toBe(201);
    expect(res.data.graph.macroId).not.toBe(createdMacroId);
    clonedMacroId = res.data.graph.macroId as string;
  });

  it('복제된 뷰는 독립적으로 조회 가능하다', async () => {
    if (!clonedMacroId) return;

    const res = await apiClient.get(`/v1/graph/graphs/${clonedMacroId}`);
    expect(res.status).toBe(200);
    expect(res.data.graph.macroId).toBe(clonedMacroId);
  });
});

describe('시나리오 6: 소프트 삭제', () => {
  it('DELETE /v1/graph/graphs/:macroId — 204를 반환한다', async () => {
    if (!clonedMacroId) return;

    const res = await apiClient.delete(`/v1/graph/graphs/${clonedMacroId}`);
    expect(res.status).toBe(204);
  });

  it('삭제된 뷰는 활성 목록에서 제외된다', async () => {
    const res = await apiClient.get('/v1/graph/graphs?onlyDeleted=false');
    const ids = (res.data.graphs as Array<{ macroId: string }>).map((v) => v.macroId);
    if (clonedMacroId) expect(ids).not.toContain(clonedMacroId);
  });

  it('삭제된 뷰는 휴지통 목록에서 조회된다', async () => {
    if (!clonedMacroId) return;
    const res = await apiClient.get('/v1/graph/graphs?onlyDeleted=true');
    const ids = (res.data.graphs as Array<{ macroId: string }>).map((v) => v.macroId);
    expect(ids).toContain(clonedMacroId);
  });
});

describe('시나리오 7: 복원', () => {
  it('POST /v1/graph/graphs/:macroId/restore — 200을 반환한다', async () => {
    if (!clonedMacroId) return;

    const res = await apiClient.post(`/v1/graph/graphs/${clonedMacroId}/restore`);
    expect(res.status).toBe(200);
  });

  it('복원된 뷰는 활성 목록에 다시 나타난다', async () => {
    if (!clonedMacroId) return;
    const res = await apiClient.get('/v1/graph/graphs?onlyDeleted=false');
    const ids = (res.data.graphs as Array<{ macroId: string }>).map((v) => v.macroId);
    expect(ids).toContain(clonedMacroId);
  });
});

describe('시나리오 8: 레거시 1:1 모드 하위 호환', () => {
  it('POST /v1/graph-ai/generate — scopeFilter 없이 호출 (레거시 동작)', async () => {
    const res = await apiClient.post('/v1/graph-ai/generate', { includeSummary: false });
    expect([200, 202]).toContain(res.status);
    if (res.status === 202) {
      expect(res.data.taskId).toBeTruthy();
    }
  });
});
