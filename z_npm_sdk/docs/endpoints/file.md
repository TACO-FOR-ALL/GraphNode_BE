# File API Reference (`client.file`)

AI 채팅 중 발생하는 첨부 파일이나 SDK를 통해 직접 업로드하는 파일을 관리합니다. 모든 파일은 S3 스토리지에 저장되며, 고유한 `key`를 통해 접근합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `uploadFiles(files)` | `POST /api/v1/ai/files` | S3 스토리지에 여러 파일 업로드 | 201, 400, 401, 502 |
| `getFile(key)` | `GET /api/v1/ai/files/:key` | 파일 키를 사용한 파일 다운로드 | 200, 400, 401, 404 |

---

## Methods

### `uploadFiles(files)`
하나 또는 여러 개의 파일을 `multipart/form-data` 형식으로 업로드합니다.

- **Usage Example**
  ```typescript
  const input = document.querySelector('input[type="file"]');
  const files = Array.from(input.files);

  const res = await client.file.uploadFiles(files);
  if (res.isSuccess) {
    const fileMetadata = res.data.attachments[0];
    console.log('업로드된 파일 키:', fileMetadata.url);
  }
  ```
- **Response Type**: `FileUploadResponse`
- **Example Response Data**
  ```json
  {
    "attachments": [
      {
        "id": "file-uuid-1",
        "url": "sdk-files/uuid-image.png",
        "name": "image.png",
        "mimeType": "image/png",
        "size": 102400
      }
    ]
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/file.ts`
- **Status Codes**
  - `201 Created`: 파일 업로드 성공. 업로드된 파일의 메타데이터(`attachments`) 배열 반환
  - `400 Bad Request`: 파일이 누락되었거나 허용되지 않는 파일 형식
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: S3 업로드 오류

---

### `getFile(key)`
파일의 고유 키를 사용하여 데이터를 다운로드합니다. 이 메서드는 서버의 `Content-Type`을 감지하여 적절한 `Blob` 형태의 응답을 반환합니다.

- **Usage Example**
  ```typescript
  // 이미지 표시
  const res = await client.file.getFile('sdk-files/uuid-image.png');
  if (res.isSuccess) {
    const url = URL.createObjectURL(res.data);
    document.getElementById('img').src = url;
  }
  ```
- **Returns**: `Promise<HttpResponse<Blob>>`
- **Status Codes**
  - `200 OK`: 파일 다운로드 성공. `Blob` 객체 반환
  - `400 Bad Request`: 파일 키(`key`)가 누락됨
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 키의 파일이 S3에 존재하지 않음

---

## Remarks

> [!NOTE]
> **File Key Structure**: 
> - `chat-files/`: AI 채팅 도중 생성/업르드된 파일 (자동 관리)
> - `sdk-files/`: SDK `uploadFiles`를 통해 직접 업로드된 파일

> [!IMPORTANT]
> **Key vs URL**: 반환되는 `FileUploadResponse`의 `url` 필드는 실제 전체 URL이 아닌, `getFile` 메서드나 AI 채팅 API의 파일 참조 시 사용되는 **S3 Key** 값입니다.
