# User Files API Reference (`client.userFiles`)

사이드바·라이브러리에 올린 **사용자 파일**과, 같은 폴더의 **노트**를 함께 쓰는 API입니다.  
(채팅 중 AI 첨부용 `client.file` / `POST /api/v1/ai/files` 와는 **다른** 경로입니다.)

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `uploadUserFile(formData)` | `POST /v1/files` | `multipart` 단일 업로드 (필드명 `file`, 선택 `folderId`) | 201, 400, 401, 404, 502 |
| `listUserFiles(...)` | `GET /v1/files` | 폴더별 파일 목록·커서 페이징 | 200, 401 |
| `getUserFile(id)` | `GET /v1/files/:id` | 파일 메타데이터 | 200, 401, 404 |
| `getUserFilePresignedViewUrl(id, params?)` | `GET /v1/files/:id/view-url` | 뷰어용 S3 Presigned GET URL | 200, 400, 401, 404 |
| `deleteUserFile(id, permanent?)` | `DELETE /v1/files/:id` | 소프트/영구 삭제 | 204, 401, 404 |
| `listSidebarItems(...)` | `GET /v1/sidebar-items` | 지정 폴더의 **노트 + 파일** 병합 목록 | 200, 401 |

**폴더 트리만** 필요하면 **`client.note`** 의 폴더 API를 사용합니다 (`GET /v1/folders`, 아래 [프론트엔드 처리 흐름](#프론트엔드-처리-흐름) 참고).

---

## Methods

### `getUserFilePresignedViewUrl(id, params?)`

인증된 사용자에게만 발급되는 **단기 유효** Presigned URL을 받습니다. PDF·이미지 뷰어의 `iframe` / `window.open` / `<img src>` 등에 `data.url`을 넣습니다.

- **Query**: `disposition` — `inline`(기본) | `attachment`
- **Response**: `UserFilePresignedViewUrlDto` — `url`, `expiresInSeconds`, `expiresAt`

만료 후에는 **동일 메서드를 재호출**합니다.

---

## 프론트엔드 처리 흐름

### 사용할 SDK

패키지 **`@taco_tsinghua/graphnode-sdk`** 의 **`GraphNodeClient`** 인스턴스를 사용합니다.

```typescript
import {
  createGraphNodeClient,
  type SidebarItemDto,
  type UserFilePresignedViewUrlDto,
} from '@taco_tsinghua/graphnode-sdk';

const client = createGraphNodeClient({
  credentials: 'include', // 세션 쿠키 (동일 출처)
});
```

Bearer만 쓰는 경우 `client.setAccessToken(...)` 등 프로젝트에서 쓰는 방식에 맞춥니다.

### 역할 나누기

| 목적 | SDK | 예시 메서드 |
| :--- | :--- | :--- |
| 폴더 트리 (루트만 → 펼칠 때마다 자식) | **`client.note`** | 루트 자식: `listFolders()` — 특정 폴더 아래: `listFolders(parentFolderId)` (내부적으로 `/v1/folders` 페이징을 모두 가져옴) |
| 한 폴더 안 **노트 + 파일** 목록 | **`client.userFiles`** | `listSidebarItems({ folderId, limit })` |
| 파일 **메타데이터**만 | **`client.userFiles`** | `getUserFile(id)` |
| 파일 **바이트 뷰** (Presigned, 권장) | **`client.userFiles`** | `getUserFilePresignedViewUrl(fileId, { disposition: 'inline' })` → `data.url` 사용 |
| 노트 편집/내용 | **`client.note`** | 기존 노트 API |

`sidebar-items` 응답의 각 행은 `kind: 'note' | 'file'` 로 구분됩니다.  
**파일**을 열 때만 `getUserFilePresignedViewUrl`을 호출하면 됩니다.

### 뷰어 구현 요령

1. `const res = await client.userFiles.getUserFilePresignedViewUrl(fileId);`
2. `res.isSuccess === true` 일 때 `res.data.url` 사용 (`HttpResponse` 유니온 타입).
3. **PDF**: `<iframe src={url} />` 또는 pdf.js — URL이 바뀔 때마다(재발급) 키를 갱신해 리마운트.
4. **이미지**: `<img src={url} alt={title} />`
5. **만료**: `expiresAt` 전에 재호출하거나, 로드 실패(403) 시 Presigned 재발급 후 재시도.
6. **CORS**: 브라우저가 presigned URL의 호스트(S3 등)로 직접 가므로, 해당 버킷 CORS에 프론트 오리진이 허용돼 있어야 합니다.

### 대안: 동일 출처 프록시

Presigned 대신 백엔드가 스트리밍하는 `GET /v1/files/:id/content` 를 쓰려면, SDK에 전용 메서드가 없을 수 있으므로 **같은 베이스 URL + `credentials: 'include'`** 로 `fetch` 하면 됩니다. (대용량·캐시 정책은 Presigned 쪽이 유리한 경우가 많습니다.)

---

## Types

- `UserFileDto`, `SidebarItemsResponseDto`, `UserFilePresignedViewUrlDto` — `src/types/userFile.ts` / 패키지 `export type` 참고.
