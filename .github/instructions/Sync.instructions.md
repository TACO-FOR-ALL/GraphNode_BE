---
applyTo: '**'
---
- **동기화 버튼** 기반으로, 서버가 권위 시계(Source of Truth)를 제공하고 **서버 시간 기준 커서**로 델타를 전송한다.
- 각 테이블의 `updated_at`/`deleted_at` 혹은 중앙 **변경 로그(change_log)** 를 이용한 **델타 싱크**를 구현한다. (일반적인 델타/CDC 패턴) [docs.couchdb.org](https://docs.couchdb.org/en/stable/replication/protocol.html?utm_source=chatgpt.com)
- 충돌은 **LWW(Last-Writer-Wins)** 전략으로 단순 해결한다. (산업 표준 옵션) [Microsoft Learn+1](https://learn.microsoft.com/en-us/azure/cosmos-db/conflict-resolution-policies?utm_source=chatgpt.com)

## 범위

- 리소스: `conversations`, `messages`, `graph_nodes`, `graph_edges` (+ 선택: `attachments`, `citations`)
- 엔드포인트: `/sync/push`, `/sync/pull`

## 핵심 원칙

1. **서버 시간 기준 커서**
    - 클라이언트는 `last_pull_at`(서버가 준 시간)을 저장한다. 이후 **`updated_at > last_pull_at`**(또는 로그 커서)인 레코드만 받는다.
    - 타임스탬프는 **RFC 3339/ISO 8601**(UTC)로 직렬화한다. [ijmacd.github.io](https://ijmacd.github.io/rfc3339-iso8601/?utm_source=chatgpt.com)
2. **소프트 삭제 전파**
    - 모든 테이블에 `deleted_at`(nullable)을 두며, 삭제는 값을 채우는 방식으로 표시한다. PULL 시 `deleted_at > cursor` 도 포함.
3. **충돌정책: LWW**
    - 동일 `(table,id)` 충돌 시 **가장 큰 `updated_at`** 을 채택(서버 시계 기준). (대체 전략이 필요해질 때까지 간소 운용) [Microsoft Learn](https://learn.microsoft.com/en-us/azure/cosmos-db/conflict-resolution-policies?utm_source=chatgpt.com)
4. **멱등성 보장(재시도 안전)**
    - `POST /sync/push` 는 **`Idempotency-Key` 헤더**를 지원한다. 동일 키+페이로드 재전송 시 **동일 결과**를 반환해야 한다. [Stripe Docs+1](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)

## 데이터 스키마(요약)

- 공통 컬럼: `created_at TIMESTAMP WITH TIME ZONE`, `updated_at TIMESTAMP WITH TIME ZONE`, `deleted_at TIMESTAMP WITH TIME ZONE NULL`
- **옵션 A(간단)**: 각 테이블의 `updated_at/deleted_at`으로 델타 계산
- **옵션 B(명시적 로그)**: `change_log{id, table, row_id, op(insert|update|delete), at, device?, meta}` 로 커서 기반 델타 제공(필요 시 CDC로 확장). [docs.couchdb.org](https://docs.couchdb.org/en/stable/replication/protocol.html?utm_source=chatgpt.com)

## API 규격(요약)

### 1) Client → Server : PUSH

`POST /sync/push`

Headers: `Idempotency-Key: <uuid4>` (권장) [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)

Body 예시:

```json
{
  "ops": {
    "conversations": [{"op":"upsert","id":null,"tempId":"c_tmp1","title":"새 대화","updated_at":"2025-10-12T11:05:00Z"}],
    "messages": [{"op":"upsert","id":null,"tempId":"m_tmp1","conversation_tempId":"c_tmp1","role":"user","text":"hi","updated_at":"2025-10-12T11:05:10Z"}],
    "deletions": [{"table":"messages","id":"m_123","deleted_at":"2025-10-12T09:10:00Z"}]
  }
}

```

서버 동작: 트랜잭션으로 upsert/soft-delete 적용 → **`idMap`(tempId→serverId)**, 적용 결과, 서버 `server_time` 을 응답.

응답 예시:

```json
{
  "ok": true,
  "idMap": { "c_tmp1": "c_901", "m_tmp1": "m_902" },
  "server_time": "2025-10-12T11:05:30Z"
}

```

### 2) Server → Client : PULL

`GET /sync/pull?since=2025-10-10T00:00:00Z&limit=500`

서버 동작: 각 테이블에서 `updated_at > since OR deleted_at > since`(또는 `change_log.at > since`) 조건의 변경분을 테이블별로 반환. 큰 경우 **페이지네이션**: `nextCursor` 포함.

응답 예시:

```json
{
  "changes": {
    "conversations": [ /* ...delta rows... */ ],
    "messages": [ /* ... */ ],
    "graph_nodes": [ /* ... */ ],
    "graph_edges": [ /* ... */ ]
  },
  "nextCursor": null,
  "server_time": "2025-10-12T11:06:02Z"
}

```

### 3) 초기 스냅샷

`since` 미지정 시 “초기 스냅샷”을 제공(압축/배치 가능) 후, 이후 호출부터 델타만 수신.

## 처리 흐름(수동 싱크 버튼)

1. **PUSH**: 로컬 변경분 전송(멱등성 키 포함) → 서버 적용/`idMap` 수신. [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
2. **PULL**: `since=last_pull_at` 로 요청 → 델타 반영(soft delete 처리, `updated_at` 비교로 LWW). [Microsoft Learn](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/how-to-manage-conflicts?utm_source=chatgpt.com)
3. 성공 시 **`last_pull_at = server_time`** 로 갱신(서버 시계 기준으로 드리프트 방지). 타임포맷은 RFC 3339. [ijmacd.github.io](https://ijmacd.github.io/rfc3339-iso8601/?utm_source=chatgpt.com)

## 품질/운영 규칙

- **대량 전송**: `limit`/`nextCursor` 로 분할.
- **검증 실패/권한 오류**: 표준 에러 **Problem Details** 로 응답(명령문 파일 4).
- **관측**: 요청·응답 로그에 **correlationId(traceparent)** 포함(로깅 명령문과 합치). [W3C](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)

## 승인 기준(AC)

- [E2E] `push → pull` 시나리오에서 재시도에도 **중복 생성/적용 0건**(멱등성 키 테스트). [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
- [정합] 동시 수정 충돌에 대해 **LWW**가 일관 적용됨(단위·통합 테스트). [Microsoft Learn](https://learn.microsoft.com/en-us/azure/cosmos-db/conflict-resolution-policies?utm_source=chatgpt.com)
- [시간] 클라이언트 로컬 시계가 잘못돼도, **서버 `server_time`** 기준으로 동기화 커서가 전파됨.
- [형식] 모든 타임스탬프가 **RFC 3339/ISO 8601(UTC)** 포맷 검증 통과. [ijmacd.github.io](https://ijmacd.github.io/rfc3339-iso8601/?utm_source=chatgpt.com)