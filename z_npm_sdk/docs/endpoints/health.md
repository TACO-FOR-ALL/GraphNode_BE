# Health API Reference (`client.health`)

서버의 현재 가동 상태를 확인하기 위한 간단한 엔드포인트를 제공합니다. 서비스 모니터링이나 초기 로드 시 서버 연결 상태를 확인하는 용도로 사용됩니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `get()` | `GET /healthz` | 서버 헬스 상태 확인 | 200, 503 |

---

## Methods

### `get()`
서버가 현재 요청을 처리할 수 있는 정상 상태인지 확인합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.health.get();
  if (data.ok) {
    console.log('서버가 정상적으로 작동 중입니다.');
  }
  ```
- **Response Type Definition**
  ```typescript
  export interface HealthResponse {
    ok: boolean;
  }
  ```
- **Example Response Data**
  ```json
  {
    "ok": true
  }
  ```
- **Type Location**: `z_npm_sdk/src/endpoints/health.ts`

---

## Remarks

> [!TIP]
> **Monitoring**: 이 엔드포인트는 부하가 매우 적으므로 로드 밸런서나 쿠버네티스의 Readiness/Liveness 탐색(Probe) 용도로 활용하기에 적합합니다.
