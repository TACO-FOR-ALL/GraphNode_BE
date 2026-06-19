# AI 측 구현 핸드오프 — 매크로 뷰 AUTO 모드

> 작성일: 2026-06-19  
> 담당: GraphNode BE팀  
> 대상: GraphNode_AI 팀

---

## 개요

매크로 뷰 생성에 **AUTO 모드**가 신설되었습니다. 이 문서는 AI 측에서 처리해야 할 SQS 메시지 타입과 처리 로직을 안내합니다. BE 측 SQS 계약 수정은 완료되었으며, AI 측에서만 신규 핸들러를 구현하면 됩니다.

---

## 신규 SQS 메시지 타입

### `MACRO_GRAPH_AUTO_REQUEST` — API → AI

| 필드 | 타입 | 설명 |
|---|---|---|
| `taskId` | `string` | 작업 고유 ID **= `macroId`** (아래 설명 참조) |
| `timestamp` | `string` | ISO 8601 발행 시각 |
| `taskType` | `"MACRO_GRAPH_AUTO_REQUEST"` | 메시지 타입 식별자 |
| `payload.userId` | `string` | 요청한 사용자 ID |
| `payload.macroId` | `string` | 생성할 매크로 뷰 ID (`taskId`와 동일) |
| `payload.scopeFilter` | `ScopeFilter` | AUTO 모드 스코프 조건 (아래 스키마 참조) |
| `payload.dataIdsS3Key` | `string` | 전체 데이터 ID 목록 JSON S3 키 |
| `payload.bucket` | `string?` | S3 버킷명 (없으면 기본 버킷 사용) |
| `payload.language` | `string?` | 사용자 선호 언어 (ko, en, zh 등) |

#### ScopeFilter 스키마 (AUTO 모드)

```json
{
  "mode": "auto",
  "intent": "RAG 아키텍처 및 벡터 DB 연구"
}
```

---

## S3 데이터 ID 목록 파일

**S3 키 형식**: `macro-auto/{taskId}/data_ids.json`

**파일 내용 구조**:

```json
{
  "conversations": ["conv_id_1", "conv_id_2", "..."],
  "notes": ["note_id_1", "..."],
  "files": ["file_id_1", "..."],
  "notionPages": ["page_id_1", "..."]
}
```

- BE가 해당 사용자의 **전체 활성 데이터** ID를 위 형식으로 업로드합니다.
- AI는 `intent` 내용을 기반으로 **적합한 항목을 자율 선택**하여 그래프를 생성합니다.

---

## `taskId === macroId` 설계 의도

기존 `GRAPH_GENERATION_RESULT` 메시지에는 `macroId` 필드가 없습니다. AI 측 계약 변경 없이 macroId를 전달하기 위해 **`taskId` 값을 `macroId`와 동일하게 설정**합니다.

결과 메시지에서 `macroId`를 별도로 반환하지 않아도 BE Worker가 `taskId`로 `macroId`를 복원합니다.

---

## AI 측 구현 체크리스트

- [ ] `MACRO_GRAPH_AUTO_REQUEST` 메시지 핸들러 추가
- [ ] S3에서 `data_ids.json` 파일을 다운로드하여 데이터 ID 목록 파싱
- [ ] `intent` + 데이터 ID 목록을 기반으로 LLM이 적합한 데이터를 선별
- [ ] 선별된 데이터로 기존 그래프 생성 파이프라인 실행 (`macroId`를 `taskId`로 사용)
- [ ] 결과는 기존 `GRAPH_GENERATION_RESULT` 포맷으로 반환 (macroId 별도 추가 불필요)
- [ ] 오류 시 `status: 'FAILED'` 및 `error` 메시지 포함

---

## BE Worker 측 처리 (참고)

`GRAPH_GENERATION_RESULT` 수신 시 `taskId === macroId`이므로, `GraphGenerationResultHandler`가 `taskId`를 `macroId`로 사용하여 Neo4j MacroGraph를 업데이트합니다.

---

## 관련 파일

| 파일 | 설명 |
|---|---|
| `src/shared/dtos/queue.ts` | `MACRO_GRAPH_AUTO_REQUEST` TaskType 및 `MacroGraphAutoRequestPayload` |
| `src/shared/dtos/macro.ts` | `ScopeFilter`, `MacroViewDto` 등 매크로 뷰 DTO |
| `src/core/services/MacroViewService.ts` | AUTO/MANUAL 모드 생성 서비스 로직 |
