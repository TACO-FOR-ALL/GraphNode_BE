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
| `updateUserFile(id, patch)` | `PATCH /v1/files/:id` | 파일 이름 변경 또는 폴더 이동 | 200, 400, 401, 404 |
| `deleteUserFile(id, permanent?)` | `DELETE /v1/files/:id` | 소프트/영구 삭제 | 204, 401, 404 |
| `listSidebarItems(...)` | `GET /v1/sidebar-items` | 지정 폴더의 **노트 + 파일** 병합 목록 *(구현 예정)* | 200, 401 |

**폴더 트리만** 필요하면 **`client.note`** 의 폴더 API를 사용합니다 (`GET /v1/folders`, 아래 [프론트엔드 처리 흐름](#프론트엔드-처리-흐름) 참고).

---

## Methods

### `uploadUserFile(file, folderId?)`

단일 파일을 업로드합니다. 내부적으로 `multipart/form-data` 형식으로 변환하여 `POST /v1/files`를 호출합니다.

- **`file`** (필수): 업로드할 파일 (`File` 객체 등)
- **`folderId`** (선택): 저장할 폴더 ID. 생략하거나 `null`이면 루트에 저장됩니다.
- 파일명 중복 시 서버가 자동으로 `이름(1).ext` 형태로 조정합니다.
- 허용 확장자: `.pdf`, `.docx`, `.ppt`, `.pptx` (MVP 기준) / 최대 파일 크기: **80MB**
- 업로드 후 백그라운드에서 AI 요약 자동 실행 (`summaryStatus: 'pending'` → `'completed'`)

| 상태 코드 | 의미 |
| :--- | :--- |
| `201 Created` | 업로드 성공 |
| `400 Bad Request` | 허용되지 않는 확장자, 파일 없음, 파일 크기(80MB) 초과 |
| `401 Unauthorized` | 인증되지 않은 요청 (세션 만료) |
| `404 Not Found` | 지정한 `folderId`가 존재하지 않거나 소유권 없음 |
| `502 Bad Gateway` | 업스트림 S3 오류 (재시도 가능) |

```typescript
// 루트에 업로드
const res = await client.userFiles.uploadUserFile(fileInput.files[0]);
if (res.isSuccess) {
  console.log('업로드 완료:', res.data.displayName, res.data.id);
}

// 특정 폴더에 업로드
const res2 = await client.userFiles.uploadUserFile(fileInput.files[0], 'folder-abc');
```

---

### `listUserFiles(params?)`

폴더별 파일 목록을 커서 기반 페이징으로 조회합니다 (`GET /v1/files`).

- `folderId`를 생략하거나 `null`로 설정하면 **루트** 파일 목록을 반환합니다.
- `nextCursor`가 `null`이면 마지막 페이지입니다.

| 파라미터 | 타입 | 설명 |
| :--- | :--- | :--- |
| `folderId` | `string \| null` | 조회할 폴더 ID. 생략 또는 `null` 시 루트 |
| `limit` | `number` | 한 번에 받을 최대 항목 수 (기본: 20) |
| `cursor` | `string` | 이전 응답의 `nextCursor` (다음 페이지) |

| 상태 코드 | 의미 |
| :--- | :--- |
| `200 OK` | 조회 성공 (파일이 없으면 `items: []` 반환) |
| `401 Unauthorized` | 인증되지 않은 요청 |

```typescript
// 루트 첫 페이지
const res = await client.userFiles.listUserFiles({ limit: 20 });
if (res.isSuccess) {
  const { items, nextCursor } = res.data;
}

// 커서 페이징으로 전체 가져오기
let cursor: string | null = undefined;
const allFiles = [];
do {
  const res = await client.userFiles.listUserFiles({ folderId: 'folder-1', cursor });
  if (!res.isSuccess) break;
  allFiles.push(...res.data.items);
  cursor = res.data.nextCursor;
} while (cursor);
```

---

### `getUserFile(id)`

파일 메타데이터를 단건 조회합니다 (`GET /v1/files/:id`).

> [!NOTE]
> 파일 바이트를 직접 스트리밍하지 않습니다. 파일 내용을 표시하려면 `getUserFilePresignedViewUrl`을 사용하세요.

| 상태 코드 | 의미 |
| :--- | :--- |
| `200 OK` | 조회 성공 |
| `401 Unauthorized` | 인증되지 않은 요청 |
| `404 Not Found` | 파일이 존재하지 않거나 소유권 없음 |

```typescript
const res = await client.userFiles.getUserFile('file-ulid-123');
if (res.isSuccess) {
  const { displayName, mimeType, summaryStatus, summary } = res.data;
  if (summaryStatus === 'completed') showSummary(summary);
}
```

---

### `getUserFilePresignedViewUrl(id, params?)`

인증된 사용자에게만 발급되는 **단기 유효 S3 Presigned GET URL**을 받습니다.  
백엔드가 소유권을 검증한 뒤 서명된 URL을 돌려주며, 이후 브라우저는 S3에 **직접 접근**합니다.  
(서버 프록시를 거치지 않으므로 대용량 파일 미리보기/다운로드에 유리합니다.)

- **Query**: `disposition` — `inline`(기본, 브라우저 뷰어 표시) | `attachment`(파일 저장 대화상자)
- **Response**: `UserFilePresignedViewUrlDto` — `url`, `expiresInSeconds`, `expiresAt`

---

#### ⏱ 유효 기간 (TTL)

| 항목 | 값 |
| :--- | :--- |
| 기본 TTL | **900초 (15분)** |
| 최솟값 | 60초 |
| 최댓값 | 604,800초 (7일, AWS 서명 상한) |
| 환경 변수 | `USER_FILE_PRESIGN_TTL_SECONDS` (서버 설정, FE에서 변경 불가) |

> [!NOTE]
> 브라우저가 Presigned URL로 S3에 **최초 요청**을 보낼 때만 유효성이 검사됩니다.  
> 이미 진행 중인 대용량 다운로드/스트리밍은 URL이 만료되어도 **중간에 끊기지 않습니다**.

---

#### ⚠️ 만료 및 403 에러 핸들링

Presigned URL이 만료된 상태로 S3에 접근하면 S3가 **HTTP 403** 을 반환합니다.  
FE는 다음 두 가지 전략 중 하나를 선택합니다.

**① 사전 방어 (권장)** — 파일을 열거나 컴포넌트가 마운트될 때마다 새 URL을 발급받는다.

```typescript
// React 예시: 컴포넌트 마운트 시 자동 발급
useEffect(() => {
  async function loadUrl() {
    const res = await client.userFiles.getUserFilePresignedViewUrl(fileId, { disposition: 'inline' });
    if (res.isSuccess) {
      setViewUrl(res.data.url);
    }
  }
  loadUrl();
}, [fileId]);
```

> [!IMPORTANT]
> 오래된 URL을 `localStorage`, `sessionStorage`, 전역 상태 등에 **장기 보관하지 마십시오.**  
> 컴포넌트가 파괴됐다가 다시 생성될 때 기존 URL이 이미 만료되어 있을 수 있습니다.

**② 사후 복구** — `onError` 핸들러에서 403을 감지해 재발급 후 URL 교체.

```typescript
// <img> onError 예시
async function handleViewError() {
  const res = await client.userFiles.getUserFilePresignedViewUrl(fileId, { disposition: 'inline' });
  if (res.isSuccess) {
    setViewUrl(res.data.url); // 상태 업데이트 → 리렌더링 → 새 URL로 재시도
  }
}

// JSX
<img src={viewUrl} onError={handleViewError} alt={file.displayName} />
```

**③ 선제적 갱신** — `expiresAt` 기준으로 만료 30초 전에 자동 재발급 (UX가 중요한 뷰어 구현 시).

```typescript
function scheduleRefresh(expiresAt: string, fileId: string, setViewUrl: (url: string) => void) {
  const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
  const refreshAt = Math.max(msUntilExpiry - 30_000, 0); // 만료 30초 전

  setTimeout(async () => {
    const res = await client.userFiles.getUserFilePresignedViewUrl(fileId, { disposition: 'inline' });
    if (res.isSuccess) {
      setViewUrl(res.data.url);
      scheduleRefresh(res.data.expiresAt, fileId, setViewUrl); // 재귀 갱신
    }
  }, refreshAt);
}
```

---

#### 📌 추가 주의사항

> [!WARNING]
> **CORS**: 브라우저가 S3 호스트로 직접 요청을 보내므로, 해당 S3 버킷의 CORS 정책에  
> 프론트엔드 오리진(`Access-Control-Allow-Origin`)이 반드시 허용되어 있어야 합니다.

- **`disposition: 'attachment'`** 로 호출하면 URL에 `Content-Disposition: attachment` 헤더가 포함되어, 브라우저가 파일을 뷰어 대신 **저장 대화상자**로 처리합니다.
- **PDF 뷰어 리마운트**: URL이 변경될 때 `<iframe key={viewUrl}>` 처럼 `key` prop을 URL로 설정하면 React가 iframe을 자동으로 리마운트합니다.

---

### `deleteUserFile(id, permanent?)`

파일을 삭제합니다 (`DELETE /v1/files/:id`).

- `permanent` 생략 또는 `false`: **소프트 삭제** (휴지통으로 이동, 30일 후 자동 영구 삭제)
- `permanent: true`: **영구 삭제** (DB 레코드 + S3 객체 즉시 제거, 복구 불가)
- 삭제 시 연결된 지식 그래프 노드도 연쇄 삭제됩니다.

| 상태 코드 | 의미 |
| :--- | :--- |
| `204 No Content` | 삭제 성공 |
| `401 Unauthorized` | 인증되지 않은 요청 |
| `404 Not Found` | 파일이 존재하지 않거나 소유권 없음 |

```typescript
// 소프트 삭제 (휴지통)
const res = await client.userFiles.deleteUserFile('file-ulid-123');
if (res.isSuccess) removeFromUI('file-ulid-123');

// 영구 삭제 (사용자 확인 요청 권장)
if (window.confirm('영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
  await client.userFiles.deleteUserFile('file-ulid-123', true);
}
```

---

### `updateUserFile(id, patch)`

파일 표시 이름 또는 폴더 위치를 변경합니다 (`PATCH /v1/files/:id`).

- `displayName`과 `folderId` 중 **최소 하나**는 포함해야 합니다.
- 두 필드 모두 생략하면 서버가 400 에러를 반환합니다.

#### 이름 중복 처리
대상 폴더에 동일한 이름이 이미 존재하면 서버가 자동으로 `이름(1).ext` 형태로 조정합니다.
클라이언트가 요청한 이름과 **응답의 `displayName`이 다를 수 있으므로** 항상 응답값을 UI에 반영하세요.

> [!IMPORTANT]
> `a.pdf`를 `a.pdf`로 변경하는 **동명(同名) 요청**은 안전하게 처리되며,
> `a(1).pdf` 같은 불필요한 접미사가 생성되지 않습니다.

#### 폴더 이동
- `folderId: null` → **루트(최상위)로 이동**
- `folderId` 필드 생략 → 현재 폴더 유지

| 상태 코드 | 의미 |
| :--- | :--- |
| `200 OK` | 변경 성공. 응답의 `displayName`이 자동 조정됐을 수 있음 |
| `400 Bad Request` | 두 필드 모두 생략, `displayName`이 빈 문자열 |
| `401 Unauthorized` | 인증되지 않은 요청 |
| `404 Not Found` | 파일 또는 대상 `folderId`가 존재하지 않거나 소유권 없음 |

```typescript
// 이름만 변경
const res = await client.userFiles.updateUserFile('file-ulid-123', {
  displayName: '최종보고서.pdf',
});
if (res.isSuccess) {
  // 응답의 displayName 반영 (중복 시 서버가 조정했을 수 있음)
  setFileName(res.data.displayName);
}

// 루트로 이동
await client.userFiles.updateUserFile('file-ulid-123', { folderId: null });

// 이름 변경 + 폴더 이동 동시 처리
const res2 = await client.userFiles.updateUserFile('file-ulid-123', {
  displayName: '보고서_최종.pdf',
  folderId: 'folder-target',
});
if (res2.isSuccess) {
  console.log('이동 완료:', res2.data.folderId, res2.data.displayName);
}
```

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

- `UserFileDto` — 파일 메타데이터 (id, displayName, mimeType, sizeBytes, summaryStatus, summary, folderId 등)
- `UserFileListResponseDto` — `{ items: UserFileDto[], nextCursor: string | null }`
- `UserFilePresignedViewUrlDto` — `{ url: string, expiresInSeconds: number, expiresAt: string }`
- `UserFilePatchDto` — `{ displayName?: string, folderId?: string | null }` (최소 하나 필수)
- `SidebarItemsResponseDto` — `src/types/userFile.ts` / 패키지 `export type` 참고
