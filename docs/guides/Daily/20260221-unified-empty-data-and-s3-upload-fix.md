# 작업 상세 문서 — 빈 데이터 처리 통일 및 S3 스트림 업로드 오류 수정

## 📌 메타 (Meta)
- **작성일**: 2026-02-21 KST
- **작성자**: AI팀
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI] [Storage]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 
  1. GET 요청 시 데이터가 없을 때 `GraphAiController` 및 `GraphManagementService`에서 `404 Not Found` 대신 일관된 "빈 객체(Empty Data Structure)"를 `200 OK`로 반환하도록 통일 (프론트엔드 에러 캐치 부담 감소).
  2. `AwsS3Adapter`에서 `Readable` 스트림 업로드 시 간헐적으로 발생하는 `ERR_HTTP_INVALID_HEADER_VALUE` 에러 분석 및 해결.
- **결과:** 
  - `GraphManagementService.ts`의 `getStats`와 `getGraphSummary`가 `null` 대신 기본 초기화된 DTO 객체를 반환하도록 수정.
  - `GraphAiController.ts`의 `getSummary`에서 404 예외 처리 분기문을 제거하여 서비스 레이어의 빈 객체를 그대로 통과시키도록 수정.
  - `@aws-sdk/lib-storage` 패키지를 도입하여 `AwsS3Adapter.ts`의 `upload` 구현 내에서 `PutObjectCommand` 대신 `Upload` 클래스(멀티파트 스트리밍 처리 지원)를 사용하도록 교체. 스트림의 전체 길이 파악 문제(Content-Length 부재)를 원천 차단.
- **영향 범위:** Graph Management API (GET Summary/Stats), AWS S3 파일 업로드 계층

---

## 📌 배경 / 컨텍스트

### 요구 사항
- **API 일관성:** 일부 스냅샷 API는 빈 배열을 `200 OK`로 주지만, 요약이나 통계 API는 `null` 리턴 시 라우터에서 `404 Not Found`를 던지고 있어 일관성이 없었음. FE는 이를 `empty` 메쏘드로 잡아 자체 처리 중이었으나 구조적 개선이 필요.
- **스트림 업로드 에러:** AI 워커 연동 부근 `requestGraphGenerationViaQueue`에서 S3로 JSON 텍스트 스트림 전송 도중 알 수 없는 HTTP 헤더 전송 오류 (`ERR_HTTP_INVALID_HEADER_VALUE`)가 발생함.

### 사전 조건/선행 작업
- 

---

## 📦 산출물

### 📁 추가된 파일
- `N/A` 

### 📄 수정된 파일
- `src/app/controllers/GraphAiController.ts` — 404 에러 반환 로직 제거
- `src/core/services/GraphManagementService.ts` — `getStats`, `getGraphSummary` 메서드의 `null` 반환을 빈 DTO 반환으로 변경
- `src/infra/aws/AwsS3Adapter.ts` — `upload` 메서드 

### 🗑 삭제된 파일
- `N/A`

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
- `src/app/controllers/GraphAiController.ts`
  - `getSummary`: 기존의 `if (!summary) res.status(404)...` 블록을 완전히 제거하여 서비스 단에서 반환한 빈 객체가 그대로 200 코드로 내려가게 함.
- `src/core/services/GraphManagementService.ts`
  - `getStats`: DB 다큐먼트가 없을 경우 `null` 대신 `{ userId, nodes: 0, edges: 0, clusters: 0 }` 포맷을 반환.
  - `getGraphSummary`: DB 다큐먼트가 없을 경우 `overview`, `clusters`, `patterns` 등이 모두 빈 배열/빈 문자열로 초기화된 뼈대 객체를 반환.
- `src/infra/aws/AwsS3Adapter.ts`
  - `upload`: 기존 단일 통신 객체 전송 클래스인 `PutObjectCommand` 사용 부분을 모두 걷어내고, `@aws-sdk/lib-storage` 모듈의 `Upload` 도구로 전면 교체. 스트림 데이터를 받을 때 자체적으로 5MB 단위의 버퍼 청크를 만들어 `Content-Length`를 계산한 뒤 멀티파트로 쏘는 방식이므로 스트림 길이를 미리 알지 못해서 생기는 에러를 해결. 호출부의 코드 파괴 없이 내부 구현만 완벽히 전환됨.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- AWS 환경 (S3 버킷 연결용 환경 변수 등록 필요 `S3_PAYLOAD_BUCKET`, `S3_FILE_BUCKET`)
- DB 연동 완료 상태

### 📦 설치
```bash
# @aws-sdk/lib-storage 신규 의존성이 생겼으므로 패키지 반영 필요
npm install
```

### ▶ 실행
```bash
npm run dev
```

### 🧪 검증
- 존재하지 않는 사용자의 토큰으로 `/v1/graph-ai/summary` GET 요청 시, `404` 대신 `200`과 함께 빈 `GraphSummaryDto` 객체가 리턴되는지 확인.
- SQS/Worker 구동 시, 노드 생성 큐에 적재 전 페이로드 JSON 스트림이 `S3_PAYLOAD_BUCKET`에 `ERR_HTTP_INVALID_HEADER_VALUE` 버그 없이 무사히 안착하는지 확인.

---

## 🛠 구성 / 가정 / 제약
- `AwsS3Adapter`에 `Upload`를 도입함으로써, 5MB가 되지 않는 작은 파일은 자동으로 기존 `PutObject` 방식으로 처리되고 큰 용량은 자동으로 파트 분할되므로 성능 제약 없음.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **S3 스트림 업로드 버그:** `Readable` 스트림은 특성상 전체 크기를 먼저 알기 어렵기 때문에 Node.js의 내장 HTTP 클라이언트가 길이를 추정하거나 할당하려다 `Content-Length`에 유효하지 않은 포맷을 발생시켜 에러를 던진 것. `lib-storage` 패키지는 이를 메모리 버퍼 청크(기본 5MB)에 일정량 모아 길이를 확실하게 계산한 뒤에 쏘는 영리한 제너레이터 방식을 사용해 문제를 원천 해결함.

---

## 🔜 다음 작업 / TODO
- 문서 인덱스(`README.md` 등) 갱신

---

## 📎 참고 / 링크
- [aws-sdk/lib-storage Upload Document](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-example-creating-buckets.html)

---

## 📜 변경 이력
- v1.0 (2026-02-21): 최초 작성
