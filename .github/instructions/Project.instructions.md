---
applyTo: '**'
---
1) 프로젝트 개요

이름: GraphNode — “대화 = 노드” 철학의 데스크탑 챗봇 애플리케이션 백엔드.

목표: 기본 Chatbox 모듈 + Graph Viewer 모듈을 갖춘 데스크탑 앱을 만든다. 백엔드는 계정/인증, 데이터 저장(대화/메시지) 을 담당한다.

그래프 변환(대화→그래프로 매핑) 규칙과 동기화는 이번 스프린트 범위 외(FE/AI가 스키마 합의 후 차기 반영).

우리가 참조하는 레퍼런스/서비스

Cherry Studio: 멀티 LLM 클라이언트로, 토픽/검색, 미니앱, MCP(Model Context Protocol) 등 기능을 제공하는 데스크탑 앱 레퍼런스. UI/모듈 구조와 “클라이언트 LLM 허브” 관점을 참고한다. 
GitHub
+2
GitHub
+2

Obsidian Graph View: 노트를 노드, 내부 링크를 엣지로 시각화하는 개념과 상호작용(노드 클릭 시 해당 노트 열기 등)을 그래프 UX 참고 기준으로 삼는다. 
Obsidian Help
+1

2) 현재 스코프(이번 2주)

반드시 구현: 계정 시스템, 소셜 로그인(Google, Apple), 세션 유지(무기한), 대화/메시지 저장 API.

문서화/표준: 모든 API는 RESTful, 오류는 Problem Details(RFC 9457), 계약은 OpenAPI 3.1로 관리한다. 
RFC Editor
+2
OpenAPI Initiative Publications
+2

이번에 제외: 그래프 변환 로직, 그래프 동기화 전략(추후 스키마 확정 후).

## 기술 스택(확정)

- 언어/런타임: **TypeScript + Node.js**
- 웹 프레임워크: **Express** (라우팅/미들웨어/에러 미들웨어) [expressjs.com+1](https://expressjs.com/en/guide/routing.html?utm_source=chatgpt.com)
- DB:
    - **MySQL**: 사용자/세션 등 정규화 데이터
    - **MongoDB**: 대화(Conversations/Messages) 문서 저장
    - **(선택) VectorDB**: 차후 의미검색/RAG 용, 이번 스프린트 범위 밖
- 인증:
    - **OAuth2 (BFF 전담)**: Google, Apple — **외부 브라우저 사용(RFC 8252)**, 임베디드 WebView 금지 [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/rfc8252/?utm_source=chatgpt.com)
    - **1 Provider = 1 User** 정책(계정 링크 없음)
    - **무기한 세션 토큰(서버 저장·철회형)** — 데스크톱 특성 고려
    - Apple은 **client secret JWT** 생성이 필수(서버 유지·회전) [Apple Developer+1](https://developer.apple.com/documentation/signinwithapplerestapi?utm_source=chatgpt.com)
- 문서/계약: **OpenAPI 3.1** + JSON Schema 2020-12(스키마), 오류는 **application/problem+json** [OpenAPI Initiative Publications+1](https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com)