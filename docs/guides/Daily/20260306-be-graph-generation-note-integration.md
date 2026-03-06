# 작업 상세 문서 — [BE] 그래프 생성 시 노트(Markdown) 데이터 통합

## 📌 메타 (Meta)
- **작성일**: 2026-03-06 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 지식 그래프 생성 과정에서 기존 대화 내역뿐만 아니라 사용자의 개인 노트(Markdown) 데이터를 함께 반영하여 풍부한 그래프를 추출함.
- **결과:** `GraphGenerationService`에서 노트 수집 및 S3 업로드 로직 구현, AI Worker로의 페이로드 전달 체계 구축 및 유닛 테스트 완료.
- **영향 범위:** `GraphAiController`, `GraphGenerationService`, `NoteService`, DI Container (`container.ts`).

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 그래프 생성 요청 시 사용자의 마크다운 노트를 S3에 업로드하고 AI 모듈이 이를 처리할 수 있도록 S3 키를 전달해야 함.
- 기존 대화 기반 그래프 생성 로직의 하위 호환성을 유지해야 함.
- 원본 데이터의 ID(\_id)를 보존하여 결과 매핑이 가능하게 해야 함.

### 사전 조건/선행 작업
- `NoteService`에 `findNotesModifiedSince` 메서드가 구현되어 있어야 함.
- AI Worker가 `extraS3Keys` 필드를 처리할 수 있도록 준비되어야 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/services/GraphGenerationService.ts` — 노트 스트리밍 및 S3 업로드 로직 추가
- `src/bootstrap/container.ts` — `GraphGenerationService`에 `NoteService` 의존성 주입
- `tests/unit/GraphGenerationService.spec.ts` — 노트 통합 케이스 테스트 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/GraphGenerationService.ts`
- `streamNotes(userId)` — 사용자 노트를 조회하여 JSON 배열 형태로 스트리밍하는 제너레이터 구현.
- `requestGraphGenerationViaQueue(userId)` — 메인 로직 내에서 `streamNotes`를 호출, 결과를 `notes.json`으로 S3에 업로드하고 `extraS3Keys`에 포함시키도록 변경.
- `testRequestAddNodeViaQueue(userId)` — 테스트용 노드 추가 요청 메서드 복구.

#### `src/bootstrap/container.ts`
- `GraphGenerationService` 생성 시 `NoteService`를 3번째 인자로 주입하도록 수정.

#### `tests/unit/GraphGenerationService.spec.ts`
- `NoteService` 모킹 및 의존성 주입 추가.
- 'should include note data S3 key if notes exist' 테스트 케이스 추가하여 SQS 페이로드 검증.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- AWS S3 Payload Bucket 설정 필요
- MongoDB (Notes 컬렉션 데이터 존재 빌요)

### ▶ 실행
```bash
npm run build
npm run dev
```

### 🧪 검증
```bash
# 유닛 테스트 실행
npm test tests/unit/GraphGenerationService.spec.ts
```

---

## 🛠 구성 / 가정 / 제약
- 노트의 `source_type`은 'markdown'으로 고정되어 전달됨.
- S3 업로드 시 `application/json` 컨텐츠 타입을 명시함.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **빌드 오류**: DI 컨테이너 업데이트 누락으로 인한 인스턴스화 오류 발생 -> `container.ts` 수정으로 해결.
- **테스트 타입 오류**: `jest.fn()`의 타입 추론 문제 -> `jest.fn<any>()`로 명시적 타입 지정하여 해결.

---

## 🔜 다음 작업 / TODO
- AI Worker 측의 마크다운 처리 성능 최적화 검토.
- 실제 대용량 노트 환경에서의 S3 업로드 타임아웃 여부 모니터링.

---

## 📜 변경 이력
- v1.0 (2026-03-06): 최초 작성
