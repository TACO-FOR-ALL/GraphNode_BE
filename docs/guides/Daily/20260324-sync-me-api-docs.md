---
title: API 및 SDK 문서 동기화 (Me 서비스)
date: 2026-03-24
author: Antigravity
scope: [BE, SDK, Documentation]
---

## TL;DR
- **목표**: `MeRouter.ts`에 구현된 API들을 `openapi.yaml`에 반영하고, SDK 코드 `me.ts`와 매뉴얼 `me.md` 간의 차이를 해소.
- **결과**: `openapi.yaml`에 9개 엔드포인트 및 5개 스키마 추가 완료. `me.md`에 `refresh`, `getSessions`, `revokeSession` 설명 및 예제 추가 완료.
- **영향 범위**: API 문서화 정합성 확보 및 프론트엔드 개발자의 SDK 활용성 증대.

## 상세 변경 내역

### Backend API 명세 (`docs/api/`, `docs/schemas/`)
- **수정**: [openapi.yaml](docs/api/openapi.yaml)
  - `/v1/me/sessions` (GET, DELETE) 추가
  - `/v1/me/api-keys/{model}` (GET, PATCH, DELETE) 추가
  - `/v1/me/openai-assistant-id` (GET, PATCH) 추가
  - `/v1/me/preferred-language` (GET, PATCH) 추가
- **추가**: 신규 JSON 스키마 5종
  - `sessions-response.json`
  - `openai-assistant-id-response.json`
  - `update-openai-assistant-id-request.json`
  - `preferred-language-response.json`
  - `update-preferred-language-request.json`

### FE SDK 문서 (`z_npm_sdk/docs/endpoints/`)
- **수정**: [me.md](z_npm_sdk/docs/endpoints/me.md)
  - `refresh()`: 토큰 갱신 메서드 정보 추가
  - `getSessions()`: 세션 목록 조회 메서드 정보 추가
  - `revokeSession()`: 기기 로그아웃 메서드 정보 추가
  - 전체 메서드 요약 테이블 및 JSDoc 기반 가이드 업데이트

## 검증 결과
- `MeRouter.ts`의 정적 분석을 통해 모든 실제 라우트가 `openapi.yaml`과 1:1 매칭됨을 확인.
- `me.ts` 소스 코드의 실제 리턴 타입과 파라미터가 `me.md` 가이드의 예제 코드와 일치함 확인.
