# Macro Graph View — AI Agent 채팅 (FE 가이드)

## TL;DR

- FE는 Macro Graph 전체 컨텍스트를 직접 붙여 넣지 않습니다.
- Macro Graph View에서의 “전체 그래프 맥락/구조/노드 상세” 질문은 BE Agent Tool이 자동으로 조회합니다.
- 호출 API는 기존과 동일: `POST /v1/agent/chat/stream` (SSE)

---

## 1) 어떤 문제가 해결되었나

기존에는 `search_conversations`(Micro RAG) 중심이라,
사용자가 “내 그래프 전체 구조”, “전체 요약”, “특정 노드 원본/수정일” 같은 질문을 하면
파편화된 검색 결과만으로 답변 품질이 떨어질 수 있었습니다.

이번 변경으로 Agent가 다음을 Tool로 직접 조회할 수 있습니다.

- Macro graph 전체 컨텍스트(노드/엣지/클러스터/요약)
- 특정 노드의 상세 메타데이터(원본 소스, 클러스터, timestamps 등)

---

## 2) FE가 해야 할 것 (API 호출)

### 엔드포인트

- `POST /v1/agent/chat/stream`
- 인증: 로그인 쿠키 기반 (기존과 동일)
- 응답: SSE (`event: chunk|status|result|error`)

### Request Body

`ChatStreamRequestBody` 형태로 전송합니다.

- `userMessage` (필수)
- `contextText` (선택): 화면 상태(예: 사용자가 클릭한 노드 제목, UI 선택 등) 간단 텍스트로 넣어도 됨
- `modeHint` (선택): `summary|note|auto`
- `microscopeGroupId` (선택): Microscope View일 때만 사용

Macro Graph View에서는 보통 `microscopeGroupId`를 **전달하지 않습니다.**

---

## 3) FE가 하지 말아야 할 것

- Macro graph 전체 JSON을 FE가 직접 내려받아 `contextText`로 통째로 붙이는 방식 (불필요 + payload 과대)
- `POST /api/webhooks/*` 호출 (웹훅은 외부→서버)
- Notion/Graph 관련 secret을 FE env에 넣는 방식 (BE만 보유)

---

## 4) Agent가 자동으로 사용하는 Tool (FE 참고)

사용자 질문 의도에 따라 Agent가 다음 도구들을 호출할 수 있습니다.

- `get_macro_graph_context`
  - “그래프 전체 구조/전체 맥락/전체 요약/전체 노드” 류 질문에 사용
- `get_graph_node_details`
  - “A 노드 원본 링크/수정일/소속 클러스터” 류 질문에 사용
- `search_conversations`
  - 특정 키워드 기반 파편 검색(Micro RAG)

---

## 5) UX/성능 참고

- Macro graph 전체 컨텍스트는 payload가 커질 수 있어, 첫 응답이 늦을 수 있습니다.
- FE는 SSE `status` 이벤트를 그대로 표시해 사용자가 “조회 중”임을 알 수 있게 해 주세요.
- 사용자 질문이 “전체 + 특정”인 경우, Agent가 Tool을 **여러 개 연속 호출**할 수 있습니다.

---

## 6) QA 시나리오 (FE 관점)

아래 프롬프트로 동작 확인이 가능합니다.

- “내 그래프 전체를 요약해줘”
  - 기대: `get_macro_graph_context` 기반 답변
- “101번 노드의 원본과 마지막 수정일 알려줘”
  - 기대: `get_graph_node_details` 호출
- “(전체 구조) + (특정 노드 상세) 둘 다 알려줘”
  - 기대: 두 Tool이 연속/병렬로 호출될 수 있음

---

## 7) 관련 문서 (BE)

- OpenAPI: `docs/api/openapi.yaml` (Agent: `/v1/agent/chat/stream`)
- 변경 로그: `docs/guides/Daily/20260528-agent-macro-context-tools.md`
