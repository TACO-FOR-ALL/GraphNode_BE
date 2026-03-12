# Apple Auth API Reference (`client.appleAuth`)

Apple Sign In을 사용한 소셜 로그인을 지원합니다. SDK는 Apple 인증 페이지로의 안전한 리다이렉트와 관련 URL 생성 기능을 제공합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `startUrl()` | `GET /auth/apple/start` | Apple 로그인 시작 URL 조회 | - |
| `login()` | - | Apple 로그인 페이지로 즉시 이동 | - |

---

## Methods

### `startUrl()`
Apple Sign In 인증 프로세스를 시작하는 백엔드 URL을 반환합니다.

- **Usage Example**
  ```typescript
  const url = client.appleAuth.startUrl();
  // 'https://api.example.com/auth/apple/start'
  ```

---

### `login(windowObj?)`
브라우저의 현재 창을 Apple 로그인 페이지로 리다이렉트합니다.

- **Usage Example**
  ```typescript
  client.appleAuth.login();
  ```

---

## Remarks

> [!IMPORTANT]
> **Domain Validation**: Apple Sign In은 유효한 SSL 인증서와 검증된 도메인 환경에서만 정상적으로 동작합니다. 개발 시에는 Apple Developer 포털의 설정을 확인하세요.

> [!NOTE]
> **Authentication Style**: Apple 로그인은 개인정보 보호를 위해 사용자의 실제 이메일 대신 고유 식별값(Relay Email)을 제공할 수 있습니다.
