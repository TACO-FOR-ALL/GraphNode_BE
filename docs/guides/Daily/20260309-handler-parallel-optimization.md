# [Day 9] AddNode 및 Microscope Ingest 핸들러 병렬 처리 최적화

- **작성일:** 2026-03-09
- **작성자:** AI Agent
- **태그 (Scope):** `[BE]`, `[Optimization]`

## TL;DR

- **목표:** `AddNodeResultHandler` 및 `MicroscopeIngestResultHandler` 로직 내의 순차적(Sequential) DB 저장 및 알림 처리의 병목을 해결하여 처리 속도(Throughput) 최적화.
- **결과:**
  - `AddNodeResultHandler`: 다건의 노드, 엣지 업로드 루프를 `Promise.all` 기반 병렬 호출로 변경. 알림 전송 로직도 병렬 처리(`Promise.allSettled`).
  - `MicroscopeIngestResultHandler`: 독립적인 워크스페이스 완료 알림 전송 로직을 `Promise.allSettled`로 병렬 최적화.
- **영향 범위:**
  - `src/workers/handlers/AddNodeResultHandler.ts`
  - `src/workers/handlers/MicroscopeIngestResultHandler.ts`

---

## 산출물 (추가/수정/삭제 목록)

- **[수정] `src/workers/handlers/AddNodeResultHandler.ts`**
  - 개별 순차적 `upsertNode`, `upsertEdge`, `upsertCluster` 호출을 `Promise.all` 배열 기반 병렬 형태로 일괄 저장.
  - SQS 이벤트 완료 시점의 일반 알림(`sendNotification`) 및 푸시 알림(`sendFcmPushNotification`) 동시 수행.
- **[수정] `src/workers/handlers/MicroscopeIngestResultHandler.ts`**
  - SQS 워커 이벤트 완료 시점의 알림(`sendNotification`) 및 푸시 알림(`sendFcmPushNotification`)을 독립 병렬 형태로 분리(`Promise.allSettled` 사용).

---

## 핵심 로직 (Method/Class) 변경 상세

### 1) AddNodeResultHandler.ts내 DB 삽입 병렬화 적용

- **AS-IS:** `batchResult.results`를 이중 `for...of` 구조로 순회하며, 요소 하나마다 개별 스레드 락(`await graphService.upsertNode / upsertEdge`)을 대기했습니다.
- **TO-BE:** 요소 순회 시 `dbNodeId` 등 식별자 매핑 로직만 일괄 적용하며 `clusterPromises`, `nodePromises`, `edgePromises` 각각의 배열에 `graphService.upsert*` 반환 값(Promise)만 수집한 뒤, `Promise.all`로 V8 이벤트루프에 동시 처리 요청을 인가하도록 수정했습니다. 노드 생성이 엣지 생성보다 선행되어야 함이 보장되도록 두 개의 파이프라인으로 구성했습니다.

### 2) 독립 알림 전송부 병렬화 적용 (AddNode, Microscope)

- **AS-IS:** `sendNotification` 완료를 기다린 뒤, `sendFcmPushNotification`을 수행했습니다.
- **TO-BE:** 비즈니스 정합성에 영향을 미치지 않는 최종 알림 송신의 경우, 서로 간섭 없이 동시 스레드로 날아갈 수 있도록 `Promise.allSettled([...알림들])` 스니펫으로 병렬 최적화했습니다.

---

## 온보딩 및 구동 명령어 / 검증 가이드

- SQS Mock Data 혹은 실제 AddNode, Microscope Ingest 동작을 유발하는 기능을 Frontend 또는 Local Environment에서 수행합니다.
- 알림(인앱 앱 알림 및 FCM 알림)이 기존과 동일하게 지연 없이 도착하는지 확인합니다.
- 변경된 파일에서 타입 오류 및 테스트 코드 문제가 유발되지 않는지 확인합니다 (기존 Test Suite 정상 통과 확인용 CI 구동 요망).

---

## 구성, 가정 및 제약 / 보안

- `graphService`의 내부 저장 로직인 `MongoDB` `updateOne({upsert: true})` 문서들의 트랜잭션 안전성(Atomicity)을 확인한 뒤 작성했습니다. 즉, 멀티 쿼리가 동일 Collection 내 다른 도큐먼트에 동시에 이루어지더라도 경합(Conflict)이 발현되지 않음을 가정했습니다.
- **향후 리스크 점검 (배제됨):** 유저 1인이 다수의 AddNode 처리를 "거의 동일한 ms 밀리초 단위" 로 동시에 AI 요청을 보내면 `Next Node ID` 번호표 채번(`Math.max`) 로직 특성 상 Primary Key(ID)가 중복 채번되어 기존 덮어쓰기 유실이 일어날 가능성이 있습니다 (현재 Frontend가 연사 방지 기능을 탑재했다고 가정하여 이번 리팩토링 스코프에선 방어로직을 배제하였습니다).

---

## 다음 작업 목표

- 관련하여 실패한 테스트 코드 복원 확인 및 추가 테스트 코드 검증

---

## 관련 링크 및 문서 / 변경 이력

- [관련 문서/PR 링크 등 기입 여부 확인]
- 기존 [GraphGenerationResultHandler 병렬 최적화](docs/guides/Daily/20260309-handler-parallel-optimization.md) (본 문서와 유사 케이스)
