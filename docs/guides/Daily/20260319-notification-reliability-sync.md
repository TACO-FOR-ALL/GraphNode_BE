# 작업 상세 문서 — 알림 시스템 신뢰성 보강 및 문서/SDK 동기화

## 📌 메타 (Meta)

- **작성일**: 2026-03-19 KST
- **작성자**: Antigravity (AI Agent)
- **스코프 태그**: [BE] [SDK] [Docs]

---

## 📝 TL;DR (핵심 요약)

- **목표:** 최근 추가된 알림 영속화(Persistence) 및 재연결(Replay) 로직과 문서/SDK 간의 정합성 확보
- **결과:** OpenAPI 명세 업데이트, 아키텍처 문서 최신화, FE SDK의 `since` 파라미터 지원 및 이벤트 타입 보완 완료
- **추가 발견:** MongoDB TTL 인덱스가 현재 `number` 타입 필드로 인해 동작하지 않는 현상 확인 (수정 제안 필요)

---

## 📦 산출물

### 📄 수정된 파일

- `docs/api/openapi.yaml` — `/stream` 엔드포인트에 `since` 파라미터 및 응답 필드 명세 추가
- `docs/architecture/notification-system.md` — 영속화 및 재연결 아키텍처 상세 내용 반영
- `z_npm_sdk/src/endpoints/notification.ts` — `getStreamUrl(since?)` 파라미터 지원 로직 추가 (빌더 문법 오류 수정 완료)
- `z_npm_sdk/src/types/notification.ts` — `NotificationEvent` 타입에 `id`, `timestamp` 필드 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### OpenAPI (`openapi.yaml`)

- SSE 스트림 연결 시 `since` 쿼리 파라미터를 통해 과거 알림을 재전송받을 수 있음을 명시하였습니다.
- 응답 데이터 구조에 커서 역할을 하는 `id`와 발생 시각 `timestamp` 필드를 포함하도록 예시를 업데이트했습니다.

#### 아키텍처 문서 (`notification-system.md`)

- 기존 "Known Issues"에 있던 알림 유실 문제를 "Reliability Design" 섹션으로 승격시켜 구현된 내용을 기술했습니다.
- MongoDB를 활용한 영속화 방식과 ULID 기반의 Replay 구조를 설명에 추가했습니다.

#### FE SDK (`notification.ts`)

- `getStreamUrl` 메서드에서 `RequestBuilder`를 사용하여 `since` 파라미터를 쿼리 스트링으로 빌드하도록 수정했습니다.
- `NotificationEvent` 인터페이스를 백엔드와 100% 동기화하여, 프론트엔드 개발자가 알림 수신 시 `id`(커서)와 `timestamp`에 직접 접근할 수 있도록 개선했습니다.

---

## 🔍 조사 결과 (TTL 및 자동 삭제)

- **확인 사항:** `NotificationService.ts`에서 설정한 7일 TTL이 실제로 동작하는지 조사했습니다.
- **결과:** 현재 `mongodb.ts`에 TTL 인덱스는 설정되어 있으나, `NotificationService`에서 `expiresAt`를 `number`(epoch ms)로 저장하고 있습니다.
- **공식 문서 근거:** [MongoDB Official Manual - TTL Indexes](https://www.mongodb.com/docs/manual/core/index-ttl/#type)에 따르면, "To use a TTL index on a collection, you must have a field that contains either a **BSON date** or an array that contains BSON date objects."라고 명시되어 있습니다. 만약 필드 타입이 Date가 아닌 다른 타입(Number, String 등)일 경우, TTL 스레드는 해당 문서를 무시하며 자동 삭제가 수행되지 않습니다.
- **권장 조치:** `NotificationService`에서 `expiresAt` 저장 시 `new Date(now + ...)`와 같이 Date 객체로 변환하여 저장해야 합니다.

---

## 📜 변경 이력

- v1.0 (2026-03-19): 최초 작성 및 동기화 작업 완료
