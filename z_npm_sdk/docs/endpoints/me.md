# Me API Reference (`client.me`)

현재 로그인된 사용자의 프로필 정보, 환경 설정(선호 언어 등), 그리고 LLM 서비스 이용을 위한 API Key 등을 관리합니다.

## Summary

### Profile & Session

| Method               | Endpoint                     | Description                | Status Codes |
| :------------------- | :--------------------------- | :------------------------- | :----------- |
| `get()`              | `GET /v1/me`                 | 내 프로필 및 계정 정보 조회 | 200, 401, 404, 502 |
| `logout()`           | `POST /auth/logout`          | 현재 세션 로그아웃          | 204, 401     |
| `refresh()`          | `POST /auth/refresh`         | Access Token 갱신          | 200, 401     |
| `getSessions()`      | `GET /v1/me/sessions`        | 활성 세션(기기) 목록 조회   | 200, 401     |
| `revokeSession(id)`  | `DELETE /v1/me/sessions/:id` | 특정 세션 강제 종료        | 204, 400, 401 |

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

현재 로그인된 사용자의 고유 ID, 이메일, 아바타, 그리고 가입일 등의 상세 프로필 정보를 가져옵니다.

- **Usage Example**
  ```typescript
  const { data } = await client.me.get();
  console.log(`Hello, ${data.profile.displayName}`);
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
    }
  }
  ```
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

## Remarks

> [!WARNING]
> **API Key Security**: `updateApiKey` 호출 시 전달하는 실제 키 값은 외부로 노출되지 않도록 주의하십시오. SDK는 내부적으로 HTTPS 보안 연결을 통해 서버에 전송합니다.
