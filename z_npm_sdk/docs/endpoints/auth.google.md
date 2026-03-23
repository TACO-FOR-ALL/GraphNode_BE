# Google Auth API Reference (`client.googleAuth`)

Google OAuth 2.0을 사용한 소셜 로그인을 지원합니다. SDK는 복잡한 OAuth 흐름의 시작점인 인증 URL 생성 및 리다이렉트 기능을 제공합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `startUrl()` | `GET /auth/google/start` | Google 로그인 시작 URL 조회 | - |
| `login()` | - | Google 로그인 페이지로 즉시 이동 | - |

---

## Methods

### `startUrl()`
Google OAuth 2.0 인증 프로세스를 시작하는 백엔드 URL을 반환합니다.

- **Usage Example**
  ```typescript
  const url = client.googleAuth.startUrl();
  // 'https://api.example.com/auth/google/start'
  ```

---

### `login(windowObj?)`
브라우저의 현재 창을 Google 로그인 페이지로 리다이렉트합니다.

- **Usage Example**
  ```typescript
  // 브라우저에서 실행 시
  client.googleAuth.login();
  ```

---

## Remarks

> [!IMPORTANT]
> **Redirect URI**: Google Cloud Console에서 승인된 리다이렉트 URI에 `https://{your-api-domain}/auth/google/callback`이 등록되어 있어야 합니다.

> [!NOTE]
> **Session**: 인증 성공 시 서버는 브라우저 쿠키에 세션 정보를 설정합니다. 이후의 모든 요청은 이 쿠키를 기반으로 인증됩니다.
