# Note API Reference (`client.note`)

사용자의 개인 노트(Note)와 이를 분류하기 위한 폴더(Folder) 구조를 관리합니다. 노트는 Markdown 형식을 지원하며, 지식 그래프 생성의 주요 소스로 활용됩니다.

## Summary

### Notes
| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `createNote(dto)` | `POST /v1/notes` | 새 노트 생성 | 201, 400, 401, 404, 502 |
| `bulkCreate(dto)` | `POST /v1/notes/bulk` | 여러 노트 일괄 생성 | 201, 400, 401, 502 |
| `listNotes(fId?)` | `GET /v1/notes` | 모든 노트 목록 (자동 페이징) | 200, 401 |
| `getNote(id)` | `GET /v1/notes/:id` | 특정 노트 상세 조회 | 200, 401, 404, 502 |
| `updateNote(id, dto)`| `PATCH /v1/notes/:id` | 노트 내용/제목/폴더 수정 | 200, 400, 401, 404, 502 |
| `softDeleteNote(id)`| `DELETE /v1/notes/:id` | 노트를 휴지통으로 이동 | 204, 401, 404, 502 |
| `hardDeleteNote(id)`| `DELETE /v1/notes/:id?permanent=true` | 노트 영구 삭제 | 204, 401, 404, 502 |
| `deleteAllNotes()` | `DELETE /v1/notes` | 모든 활성 노트 삭제 | 200, 401 |
| `listTrash()` | `GET /v1/notes/trash` | 휴지통 내 노트/폴더 목록 | 200, 401 |
| `restoreNote(id)` | `POST /v1/notes/:id/restore` | 삭제된 노트 복구 | 200, 401, 404, 502 |

### Folders
| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `createFolder(dto)` | `POST /v1/folders` | 새 폴더 생성 | 201, 400, 401, 502 |
| `listFolders(pId?)` | `GET /v1/folders` | 모든 폴더 목록 (자동 페이징) | 200, 401 |
| `getFolder(id)` | `GET /v1/folders/:id` | 폴더 정보 조회 | 200, 401, 404, 502 |
| `updateFolder(...)` | `PATCH /v1/folders/:id` | 폴더 이름/위치 수정 | 200, 400, 401, 404, 502 |
| `softDeleteFolder(...)`| `DELETE /v1/folders/:id` | 폴더를 휴지통으로 이동 | 204, 401, 404, 502 |
| `hardDeleteFolder(...)`| `DELETE /v1/folders/:id?permanent=true` | 폴더 영구 삭제 | 204, 401, 404, 502 |
| `deleteAllFolders()` | `DELETE /v1/folders` | 모든 활성 폴더 삭제 | 200, 401 |
| `restoreFolder(id)` | `POST /v1/folders/:id/restore` | 삭제된 폴더 복구 | 200, 401, 404, 502 |

---

## Methods (Notes)

### `createNote(dto)`
새로운 마크다운 노트를 작성합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.note.createNote({
    id: 'uuid-123',
    title: '주간 회의록',
    content: '# 미팅 내용\n- 리팩토링 진행 상황 공유',
    folderId: 'folder-abc'
  });
  ```
- **Response Type**
  ```typescript
  export interface NoteDto {
    id: string;
    title: string;
    content: string;
    folderId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
  }
  ```
- **Example Response Data**
  ```json
  {
    "id": "uuid-123",
    "title": "주간 회의록",
    "content": "# 미팅 내용...",
    "folderId": "folder-abc",
    "createdAt": "2024-03-12T10:00:00Z",
    "updatedAt": "2024-03-12T10:00:00Z"
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/note.ts`
- **Status Codes**
  - `201 Created`: 노트 생성 성공
  - `400 Bad Request`: 필수 필드 누락 또는 잘못된 데이터 형식 (제목/내용 비어있음)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 지정된 `folderId`에 해당하는 폴더가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 트랜잭션 오류 (재시도 가능)

---

### `bulkCreate(dto)`
오프라인에서 작성된 여러 노트를 한 번에 동기화합니다.

- **Usage Example**
  ```typescript
  await client.note.bulkCreate({
    notes: [
      { id: 'n1', content: '노트 1' },
      { id: 'n2', content: '노트 2' }
    ]
  });
  ```
- **Response Type**: `{ notes: NoteDto[] }`
- **Status Codes**
  - `201 Created`: 일괄 생성 성공
  - `400 Bad Request`: 데이터 형식 오류 (필수 필드 누락)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류 (재시도 가능)

---

### `listNotes(folderId?)`
사용자의 모든 노트를 가져옵니다. 페이징은 내부적으로 자동 처리됩니다.

- **Usage Example**
  ```typescript
  const { data: notes } = await client.note.listNotes();
  const folderNotes = await client.note.listNotes('target-folder-id');
  ```
- **Response Type**: `NoteDto[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (노트가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `getNote(id)`
특정 노트의 상세 내용을 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.note.getNote('uuid-123');
  ```
- **Status Codes**
  - `200 OK`: 노트 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노트가 존재하지 않음 (삭제되었거나 접근 불가)
  - `502 Bad Gateway`: 데이터베이스 조회 오류

---

### `updateNote(id, dto)`
노트의 제목, 본문 또는 소속 폴더를 수정합니다.

- **Usage Example**
  ```typescript
  await client.note.updateNote('uuid-123', {
    content: '내용이 업데이트 되었습니다.',
    folderId: null // 최상위로 이동
  });
  ```
- **Status Codes**
  - `200 OK`: 수정 성공
  - `400 Bad Request`: 제목이 비어있거나 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노트 또는 지정된 폴더가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `softDeleteNote(id)`
노트를 휴지통으로 이동(논리적 삭제)합니다. `listTrash`에서 확인 가능합니다.

- **Usage Example**
  ```typescript
  await client.note.softDeleteNote('uuid-123');
  ```
- **Status Codes**
  - `204 No Content`: 휴지통 이동 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노트가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `hardDeleteNote(id)`
노트를 서버상에서 영구적으로 삭제합니다.

- **Usage Example**
  ```typescript
  await client.note.hardDeleteNote('uuid-123');
  ```
- **Status Codes**
  - `204 No Content`: 영구 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노트가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `deleteAllNotes()`
사용자의 모든 활성 노트를 일괄 삭제합니다.

- **Usage Example**
  ```typescript
  await client.note.deleteAllNotes();
  ```
- **Response Type**: `{ deletedCount: number }`
- **Status Codes**
  - `200 OK`: 삭제 성공. 삭제된 노트 수(`deletedCount`) 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `listTrash()`
삭제된 모든 노트와 폴더를 한꺼번에 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.note.listTrash();
  console.log('삭제된 노트 수:', data.notes.length);
  ```
- **Response Type**: `TrashListResponseDto`
- **Status Codes**
  - `200 OK`: 조회 성공 (삭제 항목이 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `restoreNote(id)`
휴지통에 있는 노트를 복구합니다.

- **Usage Example**
  ```typescript
  await client.note.restoreNote('uuid-123');
  ```
- **Status Codes**
  - `200 OK`: 복구 성공, 복원된 `NoteDto` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노트가 존재하지 않거나 소프트 삭제된 상태가 아님
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Methods (Folders)

### `createFolder(dto)`
사용자 정의 데이터를 분류하기 위한 새 폴더를 생성합니다.

- **Usage Example**
  ```typescript
  await client.note.createFolder({ 
    name: '신규 프로젝트', 
    parentId: 'parent-folder-uuid' // 최상위일 경우 null이나 생략
  });
  ```
- **Response Type**
  ```typescript
  export interface FolderDto {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
  }
  ```
- **Example Response Data**
  ```json
  {
    "id": "folder-uuid",
    "name": "신규 프로젝트",
    "parentId": "parent-folder-uuid",
    "createdAt": "2024-03-12T10:00:00Z",
    "updatedAt": "2024-03-12T10:00:00Z"
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/note.ts`
- **Status Codes**
  - `201 Created`: 폴더 생성 성공
  - `400 Bad Request`: 폴더 이름이 비어있거나 잘못된 형식
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류 (재시도 가능)

---

### `listFolders(parentId?)`
사용자의 모든 폴더 목록을 가져옵니다.

- **Usage Example**
  ```typescript
  // 1. 전체 폴더 목록
  const { data: allFolders } = await client.note.listFolders();
  
  // 2. 특정 폴더의 하위 폴더 목록
  const { data: children } = await client.note.listFolders('parent-id');
  ```
- **Response Type**: `FolderDto[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (폴더가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `getFolder(id)`
특정 폴더의 메타데이터를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.note.getFolder('folder-uuid');
  ```
- **Status Codes**
  - `200 OK`: 폴더 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 폴더가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 조회 오류

---

### `updateFolder(id, dto)`
폴더의 이름이나 위치(상위 폴더)를 변경합니다.

- **Usage Example**
  ```typescript
  await client.note.updateFolder('folder-uuid', {
    name: '변경된 폴더명',
    parentId: null // 최상위로 이동
  });
  ```
- **Status Codes**
  - `200 OK`: 수정 성공
  - `400 Bad Request`: 폴더 이름이 비어있거나 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 폴더 또는 지정된 상위 폴더가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `softDeleteFolder(id)`
폴더를 휴지통으로 이동합니다. 연관된 하위 폴더와 노트들도 함께 이동됩니다.

- **Usage Example**
  ```typescript
  await client.note.softDeleteFolder('folder-uuid');
  ```
- **Status Codes**
  - `204 No Content`: 휴지통 이동 성공 (하위 폴더/노트도 함께 이동)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 폴더가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `hardDeleteFolder(id)`
폴더와 그 내부의 모든 데이터를 서버에서 영구적으로 삭제합니다.

- **Usage Example**
  ```typescript
  await client.note.hardDeleteFolder('folder-uuid');
  ```
- **Status Codes**
  - `204 No Content`: 영구 삭제 성공 (하위 폴더/노트도 함께 파기)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 폴더가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `deleteAllFolders()`
사용자의 모든 활성 폴더를 일괄 삭제합니다.

- **Usage Example**
  ```typescript
  await client.note.deleteAllFolders();
  ```
- **Response Type**: `{ deletedCount: number }`
- **Status Codes**
  - `200 OK`: 삭제 성공. 삭제된 폴더 수(`deletedCount`) 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `restoreFolder(id)`
휴지통에 있는 폴더와 그 내부 콘텐츠를 복구합니다.

- **Usage Example**
  ```typescript
  await client.note.restoreFolder('folder-uuid');
  ```
- **Status Codes**
  - `200 OK`: 복구 성공, 복원된 `FolderDto` 반환 (하위 폴더/노트도 함께 복구)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 폴더가 존재하지 않거나 소프트 삭제된 상태가 아님
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Remarks

> [!TIP]
> **AI Synchronization**: 노트가 생성되거나 수정되면 AI 워커가 백그라운드에서 내용을 분석하여 자동으로 지식 그래프(Entity/Relation)를 업데이트합니다.

> [!IMPORTANT]
> **Folder Deletion**: 폴더를 삭제(soft/hard)하면 해당 폴더 내의 모든 하위 폴더와 노트들도 함께 삭제됩니다.
