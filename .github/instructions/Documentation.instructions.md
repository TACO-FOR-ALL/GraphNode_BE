---
applyTo: '**'
---
## 목표

- 모든 HTTP API는 **OpenAPI 3.1** 스펙으로 계약(Contract)을 명시하고, **JSON Schema 2020-12**로 데이터 구조를 정의한다. OpenAPI 3.1은 2020-12를 공식적으로 호환한다. [spec.openapis.org+2openapis.org+2](https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com)
- 에러 응답은 **Problem Details(RFC 9457)** 형식( `application/problem+json`)으로 표준화한다(기존 에러 명령문과 합치). [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- 문서는 **Docs-as-Code** 방식(버전관리/리뷰/자동검증/빌드)을 따른다. [Write the Docs](https://www.writethedocs.org/guide/docs-as-code.html?utm_source=chatgpt.com)

## 범위

- 서버의 모든 공개/내부 API, 데이터 구조(class/DTO/스키마), 오류 스키마, 변경 이력.

## 폴더 구조(레포 내)

```
/docs
  /api
    openapi.yaml            # 단일 진실 원천(Single Source of Truth)
    /examples               # 요청/응답 예시(JSON)
    /style                  # API 스타일가이드(네이밍/상태코드/버전 규칙)
  /schemas                  # JSON Schema 2020-12 정의(공유 모델)
    problem.json            # RFC 9457 호환 에러 스키마
    conversation.json
    message.json
    graph-node.json
    graph-edge.json
  /guides                   # How-to (동기화 흐름, OAuth 플로우 등)
  /reference                # 엔드포인트/모델 레퍼런스(MD, OAS에서 생성해도 됨)
  /adr                      # 아키텍처 결정 기록(ADR)
  CHANGELOG.md              # Keep a Changelog 포맷

```

- Notion은 요약/튜토리얼을 복제하되, **계약·스키마의 원본은 레포**가 기준이다.
- 문서 유형은 **Diátaxis**(Tutorials/How-to/Reference/Explanation) 구분을 따른다. [diataxis.fr](https://diataxis.fr/?utm_source=chatgpt.com)

## 필수 규칙

### 1) OpenAPI 3.1 (계약 우선)

- 모든 엔드포인트/메서드/상태코드/헤더/쿼리/바디/응답을 **`/docs/api/openapi.yaml`** 에 정의한다.
- 공통 스키마는 **`components/schemas/*`** 에 두고, 가능한 한 **JSON Schema** `$ref` 를 사용한다. (3.1은 2020-12 스펙을 직접 사용) [openapis.org](https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com)
- 에러 응답은 `application/problem+json` 을 **기본 오류 미디어타입**으로 선언한다. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)

### 2) JSON Schema 2020-12 (데이터 구조)

- `/docs/schemas/*.json` 은 모델 단위로 작성하며, **$id**(고유 URI)와 `$schema` 를 명시한다.
- 스키마는 예시(`examples`)와 함께 제공하고, 릴리스마다 **변경 이력**을 남긴다(아래 변경 관리 참조). [json-schema.org](https://json-schema.org/specification?utm_source=chatgpt.com)

### 3) 표준 에러(Problem Details)

- `/docs/schemas/problem.json` 으로 RFC 9457 호환 스키마 정의(`type,title,status,detail,instance` + 확장 필드).
- OpenAPI 모든 에러 응답은 이 스키마를 `$ref` 로 사용한다. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)

### 4) 스타일·일관성

- 경로/리소스/쿼리 네이밍, 상태코드 매핑, 페이징/정렬 규약 등 **스타일가이드**를 `/docs/api/style/*` 에 문서화하고, OpenAPI에 반영한다.
- 페이로드 예시는 **실제 가능한 값**으로 최신화한다.

### 5) 자동 검증 & 미리보기

- **Spectral** 룰셋으로 OpenAPI/JSON Schema를 린트하고 CI에서 강제한다(네이밍/필수필드/상태코드 규칙). [stoplight.io+1](https://stoplight.io/open-source/spectral?utm_source=chatgpt.com)
- 로컬/CI에서 **문서 미리보기**(Swagger UI/Redoc 등)를 제공한다. [Swagger+1](https://swagger.io/specification/?utm_source=chatgpt.com)

### 6) 변경 관리

- 파괴적 변경은 **/v{n} 상승**(경로 버전) 후 병행 기간 운영(REST 명령문과 합치).
- 모든 변경은 **CHANGELOG.md** 를 **Keep a Changelog** 형식으로 기록하고, SemVer를 명시한다. [keepachangelog.com](https://keepachangelog.com/en/1.1.0/?utm_source=chatgpt.com)

## 작성 지침(요약 스니펫)

### (A) OpenAPI 3.1 기본 뼈대

```yaml
openapi: 3.1.0
info:
  title: GraphNode API
  version: 1.0.0
jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema
paths:
  /v1/conversations:
    post:
      summary: Create conversation
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "../schemas/conversation.json" }
      responses:
        "201":
          description: Created
          headers:
            Location: { description: Resource URL, schema: { type: string } }
          content:
            application/json:
              schema: { $ref: "../schemas/conversation.json" }
        "400":
          description: Bad Request
          content:
            application/problem+json:
              schema: { $ref: "../schemas/problem.json" }

```

### (B) Problem Details 스키마(요약)

```json
{
  "$id": "https://graphnode.dev/schemas/problem.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["type", "title", "status", "detail", "instance"],
  "properties": {
    "type": { "type": "string", "format": "uri" },
    "title": { "type": "string" },
    "status": { "type": "integer" },
    "detail": { "type": "string" },
    "instance": { "type": "string" },
    "correlationId": { "type": "string" },
    "errors": { "type": "array", "items": { "type": "object" } }
  },
  "additionalProperties": true}

```

## 도구/자동화

- **NPM Scripts**
    - `docs:lint` — Spectral로 `openapi.yaml`/`schemas/*.json` 린트. [docs.stoplight.io](https://docs.stoplight.io/docs/spectral/9ffa04e052cc1-spectral-cli?utm_source=chatgpt.com)
    - `docs:build` — Redoc/Swagger UI로 정적 문서 생성. [Swagger+1](https://swagger.io/specification/?utm_source=chatgpt.com)
    - `docs:preview` — 로컬 프리뷰 서버.
- **CI 게이트**
    - 린트 통과 없이는 머지 금지(Spectral).
    - OAS/Schema JSON 스키마 검증.
    - 예시 payload 유효성 테스트(샘플 호출에 스키마 적용).

## 승인 기준(AC)

- **[정적]** `/docs/api/openapi.yaml` 이 존재하고, 모든 공개 API가 등재되어 있으며 **Spectral 린트 0 경고**. [stoplight.io](https://stoplight.io/open-source/spectral?utm_source=chatgpt.com)
- **[정적]** `/docs/schemas/*.json` 이 JSON Schema 2020-12로 검증 통과(`$schema`/`$id` 포함). [json-schema.org](https://json-schema.org/draft/2020-12?utm_source=chatgpt.com)
- **[런타임]** 에러 응답이 전부 `application/problem+json` 스키마에 부합한다(자동 테스트). [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- **[문서]** CHANGELOG가 Keep a Changelog 포맷으로 최신 상태이며 릴리스마다 갱신. [keepachangelog.com](https://keepachangelog.com/en/1.1.0/?utm_source=chatgpt.com)
- **[구성]** 문서 타입(튜토리얼/하우투/레퍼런스/설명)이 **Diátaxis** 구분으로 정리되어 탐색 가능. [diataxis.fr](https://diataxis.fr/?utm_source=chatgpt.com)