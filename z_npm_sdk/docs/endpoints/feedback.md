# Feedback API Reference (`client.feedback`)

사용자 피드백(버그 리포트, 기능 요청, 일반 의견 등)을 제출하고 관리합니다.
피드백은 익명 제출도 지원하며, 처리 상태(`UNREAD → READ → IN_PROGRESS → DONE`) 워크플로우를 따릅니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `create(dto)` | `POST /v1/feedback` | 새 피드백 제출 | 201, 400, 502 |
| `list(options?)` | `GET /v1/feedback` | 피드백 목록 조회 (커서 페이지네이션) | 200, 400, 502 |
| `getById(id)` | `GET /v1/feedback/:id` | 피드백 단건 조회 | 200, 404, 502 |
| `updateStatus(id, dto)` | `PATCH /v1/feedback/:id/status` | 피드백 처리 상태 변경 | 200, 400, 404, 502 |
| `deleteById(id)` | `DELETE /v1/feedback/:id` | 피드백 영구 삭제 | 204, 404, 502 |

---

## Methods

### `create(dto)`

새 피드백을 서버에 제출합니다. 익명 제출이 가능합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.feedback.create({
    category: 'BUG',
    title: '로그인 오류',
    content: '소셜 로그인 시 500 에러가 발생합니다.',
    userName: '홍길동',        // 선택
    userEmail: 'hong@example.com', // 선택
  });

  console.log(data.feedback.id);     // "550e8400-e29b-41d4-a716-446655440000"
  console.log(data.feedback.status); // "UNREAD"
  ```

- **Request Type**
  ```typescript
  export interface CreateFeedbackRequestDto {
    category: string;          // 1~191자. 예: "BUG", "FEATURE", "UX", "OTHER"
    title: string;             // 1~1000자
    content: string;           // 1~10000자
    userName?: string | null;  // 선택. 최대 191자
    userEmail?: string | null; // 선택. 유효한 이메일 형식. 최대 191자
  }
  ```

- **Response Type**
  ```typescript
  export interface FeedbackDto {
    id: string;
    category: string;
    userName: string | null;
    userEmail: string | null;
    title: string;
    content: string;
    status: string;    // 초기값: "UNREAD"
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
  }
  ```

- **Example Response Data**
  ```json
  {
    "feedback": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "category": "BUG",
      "userName": "홍길동",
      "userEmail": "hong@example.com",
      "title": "로그인 오류",
      "content": "소셜 로그인 시 500 에러가 발생합니다.",
      "status": "UNREAD",
      "createdAt": "2024-03-12T10:00:00.000Z",
      "updatedAt": "2024-03-12T10:00:00.000Z"
    }
  }
  ```

- **Type Location**: `z_npm_sdk/src/types/feedback.ts`
- **Status Codes**
  - `201 Created`: 피드백 제출 성공
  - `400 Bad Request`: 필수 필드 누락 또는 형식 오류 (빈 제목, 잘못된 이메일 등)
  - `502 Bad Gateway`: 서버 DB 저장 오류 (재시도 가능)

---

### `list(options?)`

피드백 목록을 커서 기반 페이지네이션으로 조회합니다.
결과는 생성 일시 내림차순(최신 순)으로 정렬됩니다.

- **Usage Example**
  ```typescript
  // 첫 페이지 (기본 limit 20)
  const page1 = await client.feedback.list();
  console.log(page1.data.feedbacks.length); // 최대 20개

  // 다음 페이지 조회
  if (page1.data.nextCursor) {
    const page2 = await client.feedback.list({
      limit: 10,
      cursor: page1.data.nextCursor,
    });
    console.log(page2.data.nextCursor); // null이면 마지막 페이지
  }
  ```

- **Options Type**
  ```typescript
  export interface ListFeedbackOptions {
    limit?: number;  // 1~100. 기본값 20
    cursor?: string; // 이전 응답의 nextCursor 값
  }
  ```

- **Response Type**
  ```typescript
  export interface ListFeedbackResponseDto {
    feedbacks: FeedbackDto[];
    nextCursor: string | null; // 다음 페이지 커서. 마지막 페이지면 null.
  }
  ```

- **Status Codes**
  - `200 OK`: 조회 성공 (피드백이 없으면 빈 배열)
  - `400 Bad Request`: 쿼리 파라미터 형식 오류 (limit이 범위 초과 등)
  - `502 Bad Gateway`: 서버 DB 조회 오류

---

### `getById(id)`

특정 피드백의 상세 내용을 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.feedback.getById('550e8400-e29b-41d4-a716-446655440000');

  console.log(data.feedback.title);   // "로그인 오류"
  console.log(data.feedback.status);  // "UNREAD"
  console.log(data.feedback.content); // "소셜 로그인 시 500 에러가 발생합니다."
  ```

- **Response Type**: `{ feedback: FeedbackDto }`
- **Status Codes**
  - `200 OK`: 조회 성공
  - `404 Not Found`: 해당 ID의 피드백이 존재하지 않음
  - `502 Bad Gateway`: 서버 DB 조회 오류

---

### `updateStatus(id, dto)`

피드백의 처리 상태를 변경합니다.

처리 상태 워크플로우:
```
UNREAD → READ → IN_PROGRESS → DONE
```

| 상태 | 의미 |
| :--- | :--- |
| `UNREAD` | 미확인 (초기 상태) |
| `READ` | 확인함 |
| `IN_PROGRESS` | 처리 중 |
| `DONE` | 처리 완료 |

- **Usage Example**
  ```typescript
  // 피드백을 읽음 처리
  const { data } = await client.feedback.updateStatus(
    '550e8400-e29b-41d4-a716-446655440000',
    { status: 'READ' }
  );
  console.log(data.feedback.status); // "READ"

  // 처리 완료로 변경
  await client.feedback.updateStatus(
    '550e8400-e29b-41d4-a716-446655440000',
    { status: 'DONE' }
  );
  ```

- **Request Type**
  ```typescript
  export interface UpdateFeedbackStatusDto {
    status: 'UNREAD' | 'READ' | 'IN_PROGRESS' | 'DONE';
  }
  ```

- **Response Type**: `{ feedback: FeedbackDto }`
- **Status Codes**
  - `200 OK`: 상태 변경 성공
  - `400 Bad Request`: 허용되지 않는 status 값
  - `404 Not Found`: 해당 ID의 피드백이 존재하지 않음
  - `502 Bad Gateway`: 서버 DB 갱신 오류

---

### `deleteById(id)`

피드백을 서버에서 영구적으로 삭제합니다.

> [!WARNING]
> **삭제된 피드백은 복구할 수 없습니다.** 삭제 전 확인 절차를 권장합니다.

- **Usage Example**
  ```typescript
  await client.feedback.deleteById('550e8400-e29b-41d4-a716-446655440000');
  // 성공 시 void 반환 (204 No Content)
  ```

- **Response Type**: `void`
- **Status Codes**
  - `204 No Content`: 삭제 성공
  - `404 Not Found`: 해당 ID의 피드백이 존재하지 않음
  - `502 Bad Gateway`: 서버 DB 삭제 오류

---

## Remarks

> [!TIP]
> **익명 제출**: `userName`과 `userEmail`은 선택 항목입니다. 두 필드를 생략하면 익명 피드백으로 저장됩니다.

> [!NOTE]
> **페이지네이션**: `list()` 메서드는 커서 기반 페이지네이션을 사용합니다. `nextCursor`가 `null`이면 마지막 페이지입니다.
