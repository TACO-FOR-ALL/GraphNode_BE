# Chat Export API Reference (`client.export`)

사용자의 대화 내역(메시지 및 첨부 파일 등)을 비동기적으로 압축(ZIP)하여 내보내는 기능을 제공합니다. 내보내기 작업은 서버 백그라운드에서 수행되며, 완료 시 연결된 이메일 계정으로 파일(용량이 큰 경우 다운로드 링크)이 발송됩니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `startConversationExport(...)` | `POST /v1/exports/conversations/:id` | 단일 대화 내역 비동기 내보내기 시작 | 202, 400, 401, 404, 409 |
| `startAllExports()` | `POST /v1/exports/all` | 전체 대화 내역 비동기 내보내기 시작 | 202, 401, 409 |
| `getStatus(jobId)` | `GET /v1/exports/:jobId` | 내보내기 작업 상태 조회 | 200, 400, 401, 404 |
| `download(jobId)` | `GET /v1/exports/:jobId/download` | 완료된 내보내기 파일(ZIP) Blob 다운로드 | 200, 400, 401, 404, 409 |

### 에러 상태코드 공통 설명

| 코드 | 의미 | 설명 |
| :--- | :--- | :--- |
| `400 Bad Request` | 요청 형식 오류 | 파라미터가 누락되었거나 형식이 잘못됨 |
| `401 Unauthorized` | 인증 실패 | 세션이 없거나 토큰이 만료됨 |
| `404 Not Found` | 리소스 없음 | 대상 대화(Conversation)나 조회/다운로드하려는 작업(Job)을 찾을 수 없음 |
| `409 Conflict` | 충돌 발생 | 동일한 종류의 내보내기 작업이 이미 진행 중이거나, 다운로드 요청을 보냈으나 파일이 아직 준비되지 않음 |

---

## Methods

### `startConversationExport(conversationId)`
  
단일 대화(Conversation)의 내역을 백그라운드에서 압축하여 이메일로 보내거나 다운로드 가능하도록 작업을 시작합니다.

- **Usage Example**

  ```typescript
  const response = await client.export.startConversationExport('conv-123');
  console.log('Job ID:', response.data.jobId);
  console.log('Status:', response.data.status); // 'PENDING'
  ```

- **Response Type**

  ```typescript
  export interface StartChatExportResponseDto {
    jobId: string;
    status: ChatExportJobStatus;
    exportScope: ChatExportScope;
  }
  ```

- **Status Codes**
  - `202 Accepted`: 작업 시작 성공
  - `400 Bad Request`: conversationId 누락
  - `401 Unauthorized`: 인증 실패
  - `404 Not Found`: 대상 대화가 존재하지 않음
  - `409 Conflict`: 해당 대화에 대한 작업이 이미 진행 중

---

### `startAllExports()`
  
계정에 존재하는 모든 대화 내역을 압축하여 내보내는 백그라운드 작업을 시작합니다.

- **Usage Example**

  ```typescript
  const response = await client.export.startAllExports();
  console.log('전체 내보내기 작업 ID:', response.data.jobId);
  ```

- **Status Codes**
  - `202 Accepted`: 작업 시작 성공
  - `401 Unauthorized`: 인증 실패
  - `409 Conflict`: 전체 내보내기 작업이 이미 진행 중

---

### `getStatus(jobId)`
  
요청한 내보내기 작업(`jobId`)의 현재 진행 상태를 조회합니다. 작업이 완료(`DONE`)되면 `downloadUrl` 필드가 포함됩니다.

- **Usage Example**

  ```typescript
  const response = await client.export.getStatus('job-uuid-1234');
  
  if (response.data.status === 'DONE') {
    console.log('내보내기가 완료되었습니다.');
    console.log('다운로드 링크:', response.data.downloadUrl);
  } else if (response.data.status === 'FAILED') {
    console.error('내보내기 실패:', response.data.errorMessage);
  } else {
    console.log('작업이 현재 진행 중입니다:', response.data.status);
  }
  ```

- **Response Type**

  ```typescript
  export interface ChatExportStatusResponseDto {
    jobId: string;
    status: ChatExportJobStatus; // 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
    exportScope: ChatExportScope;
    conversationId?: string;
    downloadUrl?: string; // 완료 시 생성
    errorMessage?: string; // 실패 시 생성
  }
  ```

- **Status Codes**
  - `200 OK`: 조회 성공
  - `400 Bad Request`: jobId 누락
  - `401 Unauthorized`: 인증 실패
  - `404 Not Found`: 존재하지 않는 작업 ID

---

### `download(jobId)`
  
상태가 `DONE`인 내보내기 작업의 결과 파일(ZIP 포맷)을 클라이언트로 다운로드(Blob) 받습니다.

- **Usage Example**

  ```typescript
  try {
    const blob = await client.export.download('job-uuid-1234');
    const objectUrl = window.URL.createObjectURL(blob);
    
    // 브라우저에서 강제 다운로드 동작 수행
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'chat-export.zip';
    document.body.appendChild(a);
    a.click();
    
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(a);
  } catch (err) {
    console.error('다운로드 오류:', err);
  }
  ```

- **Status Codes**
  - `200 OK`: 다운로드 성공
  - `400 Bad Request`: jobId 누락
  - `401 Unauthorized`: 인증 실패
  - `404 Not Found`: 파일을 찾을 수 없거나 이미 만료됨
  - `409 Conflict`: 작업이 아직 진행 중이어서 파일이 존재하지 않음

---

## Remarks

> [!TIP]
> **폴링(Polling) 전략**: 작업이 서버 백그라운드에서 처리되므로 클라이언트에서는 작업 시작 후 `getStatus`를 일정 주기(예: 3초)마다 호출하여 상태가 `DONE` 또는 `FAILED`가 될 때까지 확인해야 합니다.

> [!NOTE]
> **이메일 자동 발송**: 파일 용량이 시스템의 SMTP 제한에 걸리지 않는 한, 작업이 `DONE` 상태로 변경됨과 동시에 사용자의 계정에 등록된 이메일 주소로 압축된 파일이 자동 발송됩니다. 용량 제한에 걸리면 이메일에는 다운로드 링크만 포함됩니다.
