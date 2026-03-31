---
date: 2026-03-30
author: Antigravity
scope: [BE, Test]
---

# 통합 키워드 검색 API 테스트 리팩토링 및 안정화

## TL;DR

- **목표**: 통합 백엔드 테스트 실행 시 지속적으로 발생하던 비동기 리소스 누수(Async Leak) 및 오픈 핸들 타임아웃 문제를 해결하여, `/v1/search` 통합 테스트 환경의 안정성을 확보.
- **결과**: `search.spec.ts` 단독 실행 시 추가적인 리소스 오버헤드 없이 `exit code 0`으로 성공적으로 실행되며 속도가 크게 개선됨(약 6초).
- **영향 범위**: `tests/api/search.spec.ts`

## 상세 변경 사항

### 테스트를 위한 최소형 Express 앱으로 라우터 격리

- **수정된 파일**: `tests/api/search.spec.ts`
- **변경 내용**: 기존 `createApp()` 호출 시, 백엔드 전체(Redis, SQS, Sentry, 각종 Cron 등)가 부팅되면서 테스트 종료 후에도 리소스 정리가 안 되는 문제를 확인했습니다.
  - 이를 해결하고자 `express()` 인스턴스를 직접 선언하고, `express.json()` 및 테스트 타겟인 `createSearchRouter` 라우터만을 단독으로 연결했습니다.
  - `bindSessionUser`, `requireLogin` 인증 미들웨어 및 로거(`logger`)를 모두 `jest.mock`으로 우회하고, 테스트용 인증된 유저 객체(`req.user`)를 인라인 미들웨어로 주입했습니다.

### 빌드 및 스펙 호환성 확인

- 앞선 변경 사항에 추가로 전체 모듈(`graphnode_be` 및 `@taco_tsinghua/graphnode-sdk`)에 대한 `npm run build`를 성공적으로 통과하여 Type 정합성에 문제가 없음을 확인했습니다.
- **참고**: 전체 통합 테스트 (`npm test`) 명령어 수행 시 타 테스트 파일(`note.spec.ts` 등에서 기존 `createApp()` 사용)에서 잔존하는 비동기 누수가 있어 실패하기는 하나, 검색 기능의 API 레이어는 완전히 격리되어 완벽한 통과가 확인되었습니다.
