# FE SDK 핵심 아키텍처 가이드 (백엔드 팀용)

> **위치**: `docs/architecture/fe-sdk-architecture.md`  
> **관련 코드**: `z_npm_sdk/src/`  
> **SDK 사용 가이드**: [`z_npm_sdk/docs/SDK_ARCHITECTURE.md`](../../z_npm_sdk/docs/SDK_ARCHITECTURE.md)

---

## 개요

`z_npm_sdk`는 GraphNode 백엔드 API를 FE(프론트엔드)에서 타입 안전하게 사용할 수 있도록 제공되는 공식 클라이언트 SDK입니다.

---

## 아키텍처 레이어

```
[ FE 애플리케이션 ]
       ↓ createGraphNodeClient(opts)
[ GraphNodeClient (client.ts) ]       ← 사용자 진입점
       ↓ 의존성 주입
[ RequestBuilder (http-builder.ts) ]  ← HTTP 엔진 (Fluent Builder)
       ↓ fetchImpl
[ fetch API (브라우저 / Node.js) ]
       ↓
[ GraphNode 서버 ]
```

---

## 핵심 설계 원칙

### 1. Fluent Builder 패턴
`RequestBuilder`는 메서드 체이닝으로 URL과 파라미터를 조합합니다.  
각 `path()`, `query()` 호출은 **새 인스턴스**를 반환하므로 불변성(Immutability)이 보장됩니다.

### 2. 응답 타입 유니온 (`HttpResponse<T>`)
에러를 `throw` 대신 반환값으로 표현합니다.
```typescript
type HttpResponse<T> =
  | { isSuccess: true; data: T; statusCode: number }
  | { isSuccess: false; error: { statusCode: number; message: string } };
```

### 3. 동적 Access Token 참조
`accessToken`을 함수로 전달 받아, 나중에 `setAccessToken()`으로 갱신해도 즉시 모든 API에 반영됩니다.

### 4. 바이너리 응답 처리 (`sendRaw`)
기본 `get<T>()`는 JSON 파싱을 수행합니다.  
파일 다운로드처럼 바이너리 응답이 필요할 때는 `sendRaw()`로 raw `Response`를 얻어 `.blob()`으로 처리합니다.

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `src/index.ts` | Barrel Export - 외부 공개 API 정의 |
| `src/client.ts` | `GraphNodeClient` - 사용자 진입점 |
| `src/http-builder.ts` | `RequestBuilder` - HTTP 엔진 |
| `src/config.ts` | Base URL 설정 |
| `src/endpoints/*.ts` | API 그룹별 메서드 (ai, file, graph 등) |
| `src/types/*.ts` | TypeScript 타입 정의 |

---

## 파일 API 설계 (`endpoints/file.ts`)

### 파일 키 네이밍
- `chat-files/{uuid}-{name}`: AI 채팅 중 업로드된 파일 (서버 내부 처리)
- `sdk-files/{uuid}-{name}`: SDK를 통해 직접 업로드된 파일

### `uploadFiles(files)` 흐름
```
FE → FormData 생성 → POST /api/v1/ai/files → 서버 multer 처리→ S3 업로드 → FileAttachment[] 반환
```

### `getFile(key)` 흐름
```
FE → sendRaw('GET') → raw Response → res.blob() → HttpResponse<Blob>
```

> `sendRaw`를 쓰는 이유: 서버가 `Content-Type: image/png` 등 바이너리를 반환하므로  
> JSON 파싱 없이 `Blob`으로 변환해야 합니다.

---

## Microscope API 설계 (`endpoints/microscope.ts`)

### 다중 파일 업로드 및 워크스페이스 처리 흐름 (`createWorkspaceWithDocuments`)
```
FE → FormData 생성 → (files 파라미터로 여러 파일 Append) → POST /v1/microscope → 서버 multer 메모리 처리 → 개별 파일 S3 업로드 & metadata DB 생성 → SQS 전송 (AI 처리 요청) → 진행 상태가 담긴 MicroscopeWorkspace 반환
```
* `microscope` 네임스페이스는 다중 파일과 메타데이터(예: `schemaName`)를 한 번에 전송하기 위해 내부적으로 `FormData`를 조립하여 `RequestBuilder`에 넘깁니다.
* 응답 수신 후, 클라이언트는 반환된 그룹 ID(`_id`)에 대해 SSE(Server-Sent Events)를 구독하여 처리 완료 알림을 대기할 수 있습니다.

---

## 관련 백엔드 엔드포인트

| SDK 메서드 | 백엔드 엔드포인트 | 담당 파일 |
|------------|-----------------|-----------|
| `file.uploadFiles()` | `POST /api/v1/ai/files` | `file.route.ts`, `file.controller.ts` |
| `file.getFile()` | `GET /api/v1/ai/files/:key` | `file.route.ts`, `file.controller.ts` |
| `microscope.createWorkspaceWithDocuments()` | `POST /v1/microscope` | `microscope.routes.ts`, `MicroscopeController.ts` |
| `microscope.addDocumentsToWorkspace()` | `POST /v1/microscope/:groupId/documents` | `microscope.routes.ts`, `MicroscopeController.ts` |

백엔드는 `AwsS3Adapter.uploadFile()`, `AwsS3Adapter.downloadFile()` 등을 통해 S3와 통신합니다.
