# Notification API Reference (`client.notification`)

서버에서 발생하는 실시간 이벤트(그래프 생성 완료, 메시지 수신 등)를 수신하기 위한 SSE 스트림 및 모바일 푸시 알림을 위한 FCM 토큰 관리 기능을 제공합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `getStreamUrl()` | `GET /.../stream` | SSE 스트림 연결용 URL 조회 | - |
| `registerDeviceToken(t)` | `POST /.../device-token` | FCM 디바이스 토큰 등록 | 200, 401 |
| `removeDeviceToken(t)` | `DELETE /.../device-token` | FCM 디바이스 토큰 해제 | 200, 401 |

---

## Methods

### `getStreamUrl()`
실시간 알림 수신을 위한 SSE(Server-Sent Events) 스트림 URL을 반환합니다. 이 메서드는 실제 요청을 보내지 않고 URL 문자열만 생성합니다.

- **Usage Example**
  ```typescript
  const url = client.notification.getStreamUrl();
  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('알림 수신:', data);
  };
  ```
- **Returns**: `string` (SSE URL)

---

### `registerDeviceToken(token)`
모바일 푸시 알림을 받기 위해 FCM(Firebase Cloud Messaging) 디바이스 토큰을 서버에 등록합니다.

- **Usage Example**
  ```typescript
  await client.notification.registerDeviceToken('fcm-token-123...');
  ```
- **Status Codes**
  - `200 OK`: FCM 토큰 등록 성공
  - `400 Bad Request`: 토큰 값이 비어있거나 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `removeDeviceToken(token)`
서버에 등록된 FCM 토큰을 제거합니다. 로그아웃 시 호출하는 것을 권장합니다.

- **Usage Example**
  ```typescript
  await client.notification.removeDeviceToken('fcm-token-123...');
  ```
- **Status Codes**
  - `200 OK`: FCM 토큰 제거 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

## Remarks

> [!NOTE]
> **SSE Authentication**: 브라우저의 `EventSource`는 기본적으로 헤더 커스터마이징이 제한적이므로, SDK는 세션 쿠키 기반 인증을 전제로 URL을 생성합니다. `withCredentials: true` 옵션이 필수입니다.

> [!TIP]
> **Real-time Events**: 지식 그래프 생성(`graphAi.generateGraph`) 요청 후 완료 시점을 이 스트림을 통해 `GRAPH_GENERATION_COMPLETED` 이벤트로 받을 수 있습니다.
