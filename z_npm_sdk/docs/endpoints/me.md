# Me API Reference (`client.me`)

현재 로그인된 사용자의 프로필 정보, 플랜 사용량, 환경 설정(선호 언어 등), 그리고 LLM 서비스 이용을 위한 API Key 등을 관리합니다.

## Summary

### Profile, Session & Plan Usage

| Method               | Endpoint                     | Description                         | Status Codes |
| :------------------- | :--------------------------- | :---------------------------------- | :----------- |
| `get()`              | `GET /v1/me`                 | 내 프로필 + planUsage 포함 조회      | 200, 401, 404, 502 |
| `logout()`           | `POST /auth/logout`          | 현재 세션 로그아웃                   | 204, 401     |
| `refresh()`          | `POST /auth/refresh`         | Access Token 갱신                   | 200, 401     |
| `getSessions()`      | `GET /v1/me/sessions`        | 활성 세션(기기) 목록 조회            | 200, 401     |
| `revokeSession(id)`  | `DELETE /v1/me/sessions/:id` | 특정 세션 강제 종료                  | 204, 400, 401 |

### Credits & Plan

| Method                     | Endpoint                    | Description                          | Status Codes |
| :------------------------- | :-------------------------- | :----------------------------------- | :----------- |
| `getCredits()`             | `GET /v1/me/credits`        | 크레딧 잔액 및 플랜 조회 (JIT 갱신)  | 200, 401, 503 |
| `getCreditUsage(params?)`  | `GET /v1/me/credits/usage`  | 크레딧 사용 내역 조회 (페이지네이션) | 200, 400, 401, 503 |

### API Keys & AI Settings

| Method                        | Endpoint                         | Description                     | Status Codes |
| :---------------------------- | :------------------------------- | :------------------------------ | :----------- |
| `getApiKeys(model)`           | `GET /v1/me/api-keys/:model`      | 마스킹된 특정 모델 API 키 조회 | 200, 400, 401, 404 |
| `updateApiKey(model, key)`    | `PATCH /v1/me/api-keys/:model`   | 특정 모델의 API 키 설정/수정   | 204, 400, 401, 404, 502 |
| `deleteApiKey(model)`         | `DELETE /v1/me/api-keys/:model`  | 설정된 API 키 삭제             | 204, 401, 404 |
| `getOpenAiAssistantId()`      | `GET /v1/me/openai-assistant-id` | OpenAI Assistant ID 조회        | 200, 401     |
| `updateOpenAiAssistantId(id)` | `PATCH /v1/me/openai-assistant-id`| OpenAI Assistant ID 설정       | 204, 400, 401 |

### Preferences

| Method                         | Endpoint                        | Description                   | Status Codes |
| :----------------------------- | :------------------------------ | :---------------------------- | :----------- |
| `getPreferredLanguage()`       | `GET /v1/me/preferred-language` | 내 선호 언어(ko, en 등) 조회 | 200, 401     |
| `updatePreferredLanguage(lang)`| `PATCH /v1/me/preferred-language`| 선호 언어 설정 변경          | 204, 400, 401 |

---

## Methods (Profile & Session)

### `get()`

현재 로그인된 사용자의 프로필 정보와 플랜 리소스 사용량 스냅샷을 가져옵니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.get();
  console.log(`Hello, ${data.profile?.displayName}`);

  // 플랜 사용량 (planUsage는 optional — graceful degradation)
  if (data.planUsage) {
    const { chatTokens, macroSpace, microSpace, fileStorage } = data.planUsage;
    console.log(`채팅 토큰: ${chatTokens.used} / ${chatTokens.limit ?? '무제한'}`);
    console.log(`파일 용량: ${fileStorage.usedBytes} bytes`);
  }
  ```
- **Response Type**: `MeResponseDto`
- **Example Response Data**
  ```json
  {
    "userId": "user-uuid-1234",
    "profile": {
      "id": "user-uuid-1234",
      "email": "user@example.com",
      "displayName": "홍길동",
      "avatarUrl": "https://...",
      "provider": "google",
      "providerUserId": "12345",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "preferredLanguage": "ko"
    },
    "credit": {
      "balance": 30,
      "holdAmount": 0,
      "availableBalance": 30,
      "planType": "BASIC",
      "cycleStart": "2026-06-01T00:00:00.000Z",
      "cycleEnd": "2026-07-01T00:00:00.000Z"
    },
    "planUsage": {
      "planType": "BASIC",
      "chatTokens": { "used": 47832, "limit": 250000 },
      "macroSpace": { "used": 3, "limit": 10 },
      "microSpace": { "used": 12, "limit": 50 },
      "fileStorage": { "usedBytes": 524288000, "limitBytes": 10737418240 }
    }
  }
  ```
- **Enterprise 플랜 예시** (limit = null):
  ```json
  {
    "planUsage": {
      "planType": "ENTERPRISE",
      "chatTokens": { "used": 123456, "limit": null },
      "macroSpace": { "used": 42, "limit": null },
      "microSpace": { "used": 300, "limit": null },
      "fileStorage": { "usedBytes": 2147483648, "limitBytes": null }
    }
  }
  ```
- **Edge Cases**
  - `planUsage` 필드가 없는 경우: 서버 내부 집계 실패 (graceful degradation). `data.planUsage?.chatTokens` 로 optional chaining 필수.
  - `chatTokens.used`는 UTC 자정 기준으로 리셋됩니다.
- **Type Location**: `z_npm_sdk/src/types/me.ts`
- **Status Codes**
  - `200 OK`: 프로필 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 사용자 정보가 DB에 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 조회 오류

---

### `logout()`

현재 세션을 종료하고 서버 측 인증 토큰을 무효화합니다.

- **Usage Example**
  ```typescript
  await client.me.logout();
  ```
- **Status Codes**
  - `204 No Content`: 로그아웃 성공, 세션 및 토큰 무효화 완료
  - `401 Unauthorized`: 이미 만료된 세션이거나 유효하지 않은 인증 정보

---

### `refresh()`

인증 토큰(Refresh Token)을 사용하여 새로운 Access Token을 발급받습니다. 주로 401 에러가 발생했을 때 자동으로 토큰을 갱신하는 흐름에서 사용됩니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.refresh();
  if (data.ok) {
    console.log('Token refreshed successfully');
  }
  ```
- **Response Type**: `{ ok: boolean }`
- **Status Codes**
  - `200 OK`: 새로운 Access Token 발급 성공 (`{ ok: true }` 반환)
  - `401 Unauthorized`: Refresh Token이 만료되었거나 유효하지 않아 재발급 불가. 재로그인 필요

---

### `getSessions()`

현재 사용자 계정으로 로그인된 모든 활성 세션(기기) 목록을 조회합니다. 각 세션의 생성 시각과 현재 요청 기기 여부를 확인할 수 있습니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.getSessions();
  data.sessions.forEach(s => {
    console.log(`${s.sessionId}: ${s.isCurrent ? '(Current)' : ''}`);
  });
  ```
- **Response Type**: `SessionsResponseDto`
- **Status Codes**
  - `200 OK`: 세션 목록 조회 성공 (세션이 없으면 빈 배열 반환)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `revokeSession(sessionId)`

특정 세션(기기)을 강제로 로그아웃시킵니다. 자신의 현재 세션을 중단하면 즉시 인증이 만료될 수 있습니다.

- **Usage Example**
  ```typescript
  await client.me.revokeSession('a1b2c3d4e5f6g7h8');
  ```
- **Parameters**: `sessionId` - 세션 식별 아이디 (16자 Hex string)
- **Status Codes**
  - `204 No Content`: 세션 강제 종료 성공
  - `400 Bad Request`: `sessionId` 형식이 올바르지 않음 (16자 Hex string이 아님)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

## Methods (API Keys & AI Settings)

### `getApiKeys(model)`

OpenAI, DeepSeek 등 특정 모델에 대해 설정된 API 키를 조회합니다. 보안을 위해 전체 키가 아닌 일부가 마스킹 처리되어 반환됩니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.getApiKeys('openai');
  console.log('Masked Key:', data.apiKey); // "sk-proj-...abcd"
  ```
- **Parameters**: `model` - `'openai' | 'deepseek' | 'claude' | 'gemini'`
- **Response Type**: `ApiKeysResponseDto`
- **Status Codes**
  - `200 OK`: 마스킹된 API 키 조회 성공
  - `400 Bad Request`: 지원하지 않는 `model` 값이 전달됨
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 모델에 대해 설정된 API 키가 없음

---

### `updateApiKey(model, apiKey)`

특정 LLM 모델 서비스를 사용하기 위한 개인 API 키를 등록하거나 업데이트합니다.

- **Usage Example**
  ```typescript
  await client.me.updateApiKey('openai', 'sk-proj-your-actual-key');
  ```
- **Status Codes**
  - `204 No Content`: API 키 등록/업데이트 성공
  - `400 Bad Request`: 지원하지 않는 `model` 값이거나 키 형식이 올바르지 않음
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 지원하지 않는 모델 타입
  - `502 Bad Gateway`: 외부 AI 공급자 검증 또는 데이터베이스 저장 오류

---

### `deleteApiKey(model)`

저장된 특정 모델의 API 키를 삭제합니다.

- **Usage Example**
  ```typescript
  await client.me.deleteApiKey('openai');
  ```
- **Status Codes**
  - `204 No Content`: API 키 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 모델에 대해 설정된 API 키가 없거나 지원하지 않는 모델

---

### `getOpenAiAssistantId()`

현재 설정된 OpenAI Assistant ID를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.getOpenAiAssistantId();
  console.log('Assistant ID:', data.assistantId);
  ```
- **Response Type**: `OpenAiAssistantIdResponseDto` (`{ assistantId: string | null }`)
- **Status Codes**
  - `200 OK`: 조회 성공. 설정된 값이 없으면 `assistantId: null` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `updateOpenAiAssistantId(assistantId)`

OpenAI Assistant ID를 설정하거나 업데이트합니다.

- **Usage Example**
  ```typescript
  await client.me.updateOpenAiAssistantId('asst_123456');
  ```
- **Status Codes**
  - `204 No Content`: Assistant ID 설정/업데이트 성공
  - `400 Bad Request`: `assistantId` 형식이 올바르지 않음 (빈 문자열 등)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

## Methods (Preferences)

### `getPreferredLanguage()`

AI 응답 및 요약 시 우선적으로 사용되는 언어 설정을 확인합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.getPreferredLanguage();
  console.log('Language:', data.language); // 'ko', 'en', 'cn' 등
  ```
- **Response Type**: `PreferredLanguageResponseDto`
- **Status Codes**
  - `200 OK`: 선호 언어 설정 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `updatePreferredLanguage(language)`

서비스 전체에서 사용할 선호 언어를 변경합니다.

- **Usage Example**
  ```typescript
  await client.me.updatePreferredLanguage('en');
  ```
- **Constraints**: `'ko' | 'en' | 'cn'` 형식만 허용됩니다. 그 외의 값을 입력하면 SDK 수준 혹은 서버 수준에서 에러가 발생합니다.
- **Status Codes**
  - `204 No Content`: 선호 언어 변경 성공
  - `400 Bad Request`: 허용되지 않는 언어 코드 (`'ko' | 'en' | 'cn'` 이외의 값)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

---

## Methods (Credits & Plan)

### `getCredits()`

현재 크레딧 잔액 및 플랜 정보를 조회합니다. 내부적으로 JIT(Just-In-Time) 갱신 로직이 실행되어 구독 주기가 만료된 경우 자동으로 크레딧이 충전됩니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.getCredits();
  console.log(`잔액: ${data.availableBalance} 크레딧 (플랜: ${data.planType})`);
  ```
- **Response Type**: `CreditBalanceDto`
- **Example Response Data**
  ```json
  {
    "balance": 500,
    "holdAmount": 0,
    "availableBalance": 500,
    "planType": "BASIC",
    "cycleStart": "2026-06-01T00:00:00.000Z",
    "cycleEnd": "2026-07-01T00:00:00.000Z"
  }
  ```
- **Status Codes**
  - `200 OK`: 크레딧 잔액 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `503 Service Unavailable`: 크레딧 서비스 이용 불가

---

### `getCreditUsage(params?)`

크레딧 사용 내역을 최신순으로 페이지네이션 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.getCreditUsage({ limit: 10, offset: 0 });
  data.items.forEach(item => {
    console.log(`${item.feature}: -${item.creditUsed} (${item.createdAt})`);
  });
  // 사용 내역 없음
  // { items: [], total: 0 }
  ```
- **Parameters**
  - `params.limit` (number, optional): 한 번에 가져올 항목 수 (기본 20, 최대 100)
  - `params.offset` (number, optional): 건너뛸 항목 수 (기본 0)
- **Response Type**: `CreditUsageDto`
- **Example Response Data**
  ```json
  {
    "items": [
      {
        "id": "log-uuid-1",
        "feature": "AI_CHAT",
        "creditUsed": 1,
        "status": "SUCCESS",
        "taskId": null,
        "createdAt": "2026-06-25T10:30:00.000Z"
      }
    ],
    "total": 42
  }
  ```
- **Status Codes**
  - `200 OK`: 사용 내역 조회 성공 (내역 없으면 빈 배열)
  - `400 Bad Request`: `limit` / `offset` 파라미터 유효성 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `503 Service Unavailable`: 크레딧 서비스 이용 불가

---

## Remarks

> [!WARNING]
> **API Key Security**: `updateApiKey` 호출 시 전달하는 실제 키 값은 외부로 노출되지 않도록 주의하십시오. SDK는 내부적으로 HTTPS 보안 연결을 통해 서버에 전송합니다.

> [!NOTE]
> **planUsage optional chaining**: `GET /v1/me` 응답의 `planUsage` 필드는 서버 내부 집계 실패 시 생략될 수 있습니다. `data.planUsage?.chatTokens` 형식으로 optional chaining을 반드시 사용하세요.
