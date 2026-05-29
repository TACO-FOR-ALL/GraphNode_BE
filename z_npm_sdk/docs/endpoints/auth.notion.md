# Notion Auth & Proxy API Reference (`client.notionAuth`)

Notion OAuth 연동 및 연동된 노션 페이지/블록 조회(Lazy Loading) 기능을 제공합니다. 노션 API의 엄격한 호출 제한(Rate Limit)을 안전하게 우회하기 위해 모든 요청은 백엔드 프록시를 거치며, 지연 시간(Backoff) 관리가 내장되어 있습니다.

> **SDK 0.1.97 업데이트**: 노션 API 프록시 엔드포인트 및 OAuth 2.0 지원이 추가되었습니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `getAuthUrl()` | `GET /api/auth/notion` | Notion Public Integration 인가 URL 반환 | 200, 302, 401 |
| `getRootPages()` | `GET /api/notion/pages` | 연결된 워크스페이스의 루트 페이지 목록 조회 | 200, 400, 401, 429 |
| `getBlockChildren(blockId, cursor?)` | `GET /api/notion/blocks/:blockId/children` | 특정 블록의 자식 블록들 지연 로딩(Lazy Loading) | 200, 400, 401, 429 |

### 에러 상태코드 공통 설명

| 코드 | 의미 | `code` 필드 | 비고 |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | 요청 형식 오류 또는 연동 정보 누락 | `VALIDATION_FAILED` | 노션 연동을 먼저 수행해야 함 |
| `401 Unauthorized` | 인증 실패 | `AUTH_REQUIRED` | 세션 재로그인 필요 |
| `429 Too Many Requests` | 노션 일일/초당 사용 한도 초과 | `RATE_LIMITED` | 서버 내부 백오프를 뚫고 초과한 경우 |

#### `429 Too Many Requests` — 노션 API 한도 초과
노션은 초당 평균 3회의 API 호출로 제한됩니다. 서버 단에서 `Retry-After` 헤더를 읽고 최대 3회 지수 백오프(Exponential Backoff)를 수행하여 방어하지만, 이마저도 초과할 경우 429 에러가 프론트엔드로 전달됩니다. 잠시 후 재시도해야 합니다.

---

## Methods

### `getAuthUrl(redirect?)`

백엔드의 OAuth 시작점(`/api/auth/notion`)을 호출하여 인가 URL을 획득합니다. 프론트엔드는 이 URL을 팝업창 등에 띄워 사용자 로그인을 유도합니다.

- **Usage Example**

  ```typescript
  async function startNotionLink() {
    // 1. 인가 URL 가져오기
    const response = await client.notionAuth.getAuthUrl();
    
    if (response.isSuccess) {
      // 2. 팝업으로 노션 인증 창 열기
      const popup = window.open(response.data.url, 'NotionAuth', 'width=600,height=800');
      
      // 3. postMessage를 통한 결과 수신 대기 (백엔드의 callback 페이지가 발송)
      window.addEventListener('message', (event) => {
        if (event.data.type === 'notion-link-success') {
          console.log('연동된 워크스페이스:', event.data.notionWorkspaceName);
          popup?.close();
        }
      });
    }
  }
  ```

- **Response Type**

  ```typescript
  interface AuthUrlResponse {
    url: string;
  }
  ```

- **Status Codes**
  - `200 OK`: URL 조회 성공
  - `302 Found`: `redirect=true` 파라미터 전달 시 즉시 리다이렉트
  - `401 Unauthorized`: 인증되지 않은 요청

---

### `getRootPages()`

연결된 노션 워크스페이스의 루트 페이지(데이터베이스 포함) 목록을 조회합니다. 사용자에게 최초 트리 구조를 보여줄 때 사용합니다.

- **Usage Example**

  ```typescript
  const response = await client.notionAuth.getRootPages();
  if (response.isSuccess) {
    console.log('Root Pages:', response.data.results);
    // [{ id: '...', object: 'page', properties: {...} }, ...]
  }
  ```

- **Response Type**

  ```typescript
  interface NotionPagesResponse {
    results: any[]; // 노션 Page 객체 포맷
  }
  ```

- **Status Codes**
  - `200 OK`: 조회 성공
  - `400 Bad Request`: 연동된 노션 정보가 없거나 유효하지 않음
  - `401 Unauthorized`: 인증되지 않은 요청
  - `429 Too Many Requests`: 노션 API Rate Limit 도달

---

### `getBlockChildren(blockId, cursor?)`

특정 블록(또는 페이지)의 자식 블록 목록을 지연 로딩(Lazy Loading)으로 페이징 조회합니다. 트리 UI에서 사용자가 노드를 확장(Expand)할 때 호출합니다.

- **Usage Example**

  ```typescript
  // 1. 최초 조회
  const page1 = await client.notionAuth.getBlockChildren('block-uuid');
  
  if (page1.isSuccess) {
    console.log('Children:', page1.data.results);
    
    // 2. 다음 페이지(커서) 조회
    if (page1.data.has_more) {
      const page2 = await client.notionAuth.getBlockChildren('block-uuid', page1.data.next_cursor!);
      console.log('Next Children:', page2.data.results);
    }
  }
  ```

- **Response Type**

  ```typescript
  interface NotionBlocksResponse {
    results: any[];
    next_cursor: string | null;
    has_more: boolean;
  }
  ```

- **Status Codes**
  - `200 OK`: 조회 성공
  - `400 Bad Request`: 블록 ID 형식이 잘못되었거나 연동 정보 없음
  - `401 Unauthorized`: 인증되지 않은 요청
  - `429 Too Many Requests`: 노션 API Rate Limit 도달

---

## Remarks

> [!TIP]
> **Rate Limit 429 에러 자동 방어**: 백엔드 시스템에서 `Retry-After` 헤더 기반 지수 백오프(Exponential Backoff) 로직이 구동됩니다. 프론트엔드 레벨에서 별도의 재시도 큐(Queue) 로직을 구현할 필요 없이 투명하게 처리됩니다.

> [!WARNING]
> **전체 트리 순회 금지 (Lazy Loading 필수)**: 노션 API는 1000개의 하위 블록까지만 반환하며 Rate Limit이 빡빡합니다. 전체 페이지 트리를 한 번에 순회하는 호출은 절대 금지되며, 반드시 유저 상호작용(트리 토글)에 맞춰 `getBlockChildren`을 사용한 지연 로딩 방식을 설계해야 합니다.
