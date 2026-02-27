# 작업 상세 문서 — 파일 업로드/다운로드 API 구축 및 FE SDK 파일 처리 노출

## 📌 메타 (Meta)
- **작성일**: 2026-02-27 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [FE SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 파일 업로드 API를 백엔드에 추가하고, FE SDK에 `uploadFiles`/`getFile` 메서드를 노출. `AwsS3Adapter`에 `downloadFile` 완전 구현. SDK 내부 아키텍처 문서화.
- **결과:** `POST /api/v1/ai/files` 업로드 엔드포인트 추가. `GET /api/v1/ai/files/:key` 다운로드 응답 완전화(Content-Type/Length 포함). `z_npm_sdk`에 `FileApi` 클래스 추가. SDK 아키텍처 문서 2종 작성.
- **영향 범위:** `file.route.ts`, `file.controller.ts`, `AwsS3Adapter.ts`, `StoragePort.ts`, `z_npm_sdk/endpoints/file.ts`, `z_npm_sdk/types/file.ts`, `z_npm_sdk/client.ts`, `z_npm_sdk/index.ts`, `docs/architecture/fe-sdk-architecture.md`, `z_npm_sdk/docs/SDK_ARCHITECTURE.md`

---

## 📦 산출물

### 📁 추가된 파일
- `z_npm_sdk/src/endpoints/file.ts` — `FileApi` 클래스 (uploadFiles, getFile)
- `z_npm_sdk/src/types/file.ts` — `FileAttachment`, `FileUploadResponse` 타입
- `z_npm_sdk/docs/SDK_ARCHITECTURE.md` — SDK 구조 초보자용 아키텍처 가이드
- `docs/architecture/fe-sdk-architecture.md` — 백엔드 팀용 FE SDK 아키텍처 참조 문서

### 📄 수정된 파일
- `src/app/routes/file.route.ts` — `POST /` 업로드 라우트 추가 (multer 포함)
- `src/app/controllers/file.controller.ts` — `uploadFiles` 메서드 추가, `downloadFile` 개선 (버퍼 방식 + Content-Type/Length)
- `src/core/ports/StoragePort.ts` — `downloadFile` 인터페이스 추가
- `src/infra/aws/AwsS3Adapter.ts` — `downloadFile` 메서드 구현 (Buffer + 메타데이터)
- `z_npm_sdk/src/client.ts` — `FileApi` 인스턴스 추가
- `z_npm_sdk/src/index.ts` — `FileApi`, `FileAttachment`, `FileUploadResponse` export 추가
- `z_npm_sdk/README.md` — SDK 아키텍처 가이드 링크 추가
- `docs/api/openapi.yaml` — `POST /v1/ai/files` 엔드포인트 사양 추가
- `GraphNode/README.md` — FE SDK 아키텍처 문서 링크 추가

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `z_npm_sdk/src/endpoints/file.ts`
- `FileApi.uploadFiles(files)` — FormData로 파일 배열을 POST, S3에 `sdk-files/{uuid}-{name}` 키로 저장
- `FileApi.getFile(key)` — `sendRaw('GET')` 사용하여 바이너리 응답을 안전하게 처리 후 `Blob` 반환

#### `z_npm_sdk/src/types/file.ts`
- `FileAttachment` — 업로드된 파일 메타데이터 타입 (id, type, url, name, mimeType, size)
- `FileUploadResponse` — 업로드 응답 타입 ({ attachments: FileAttachment[] })

### ✏ 수정 (Modified)

#### `src/infra/aws/AwsS3Adapter.ts`
- `downloadFile(key, options)` — GetObjectCommand 후 스트림을 버퍼로 수집, `contentType`/`contentLength`와 함께 반환. `StoragePort` 인터페이스를 완전 충족.

#### `src/app/controllers/file.controller.ts`
- `downloadFile` — `downloadStream` → `downloadFile` 방식으로 변경. `Content-Type`, `Content-Length` 헤더를 완전히 설정하여 브라우저/Electron 모든 환경에서 올바른 다운로드 처리.
- `uploadFiles` — 새 메서드 추가. Multer에서 파일 수신 후 S3에 `sdk-files/` 키로 업로드.

---

## 🆕 파일 키 네이밍 규약
- `chat-files/{uuid}-{originalname}`: AI 채팅 중 서버가 처리한 파일
- `sdk-files/{uuid}-{originalname}`: FE SDK의 `uploadFiles()`를 통해 직접 업로드된 파일

---

## 🚀 재현/실행 절차

### 업로드 테스트
```bash
curl -X POST https://api.example.com/api/v1/ai/files \
  -F "files=@/path/to/image.png" \
  -H "Authorization: Bearer {token}"
# 응답: { "attachments": [{ "id": "...", "url": "sdk-files/uuid-image.png", ... }] }
```

### 다운로드 테스트
```bash
curl -X GET "https://api.example.com/api/v1/ai/files/sdk-files/uuid-image.png" \
  -H "Authorization: Bearer {token}" \
  --output image.png
```

---

## ⚠ 트러블슈팅

- **`downloadFile` 미구현 lint 오류**: `StoragePort`에 인터페이스만 추가하고 `AwsS3Adapter`에 구현하지 않아 발생. 이번 작업에서 `AwsS3Adapter.downloadFile`을 완전히 구현하여 해결.
- **`getFile` 바이너리 응답**: 기본 `get<T>()`는 `JSON.parse`를 시도하여 이미지/PDF 응답에 파싱 오류 발생. `sendRaw` + `res.blob()` 방식으로 변경하여 해결.

---

## 📎 참고 / 링크
- [SDK 아키텍처 가이드](../../../z_npm_sdk/docs/SDK_ARCHITECTURE.md)
- [BE FE SDK 아키텍처](./fe-sdk-architecture.md)
- [OpenAPI 스펙](../../api/openapi.yaml)

---

## 📜 변경 이력
- v1.0 (2026-02-27): 최초 작성
