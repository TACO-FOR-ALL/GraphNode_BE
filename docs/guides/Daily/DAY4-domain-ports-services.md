# Day 4 — 도메인/포트/서비스/리포지토리 틀 구성

## TL;DR

- 도메인 엔티티(User/Conversation/Message), 포트(UserRepository/ConversationRepository/MessageRepository), 서비스(CreateConversationService), 인프라 구현(MySQL/Mongo) 추가.
- 레이어 규칙(MVS/Ports & Adapters) 준수. 서비스는 Express 비의존, 컨트롤러는 서비스만 호출.

## 산출물

- 도메인: `src/core/domain/{User,Conversation,Message}.ts`
- 포트: `src/core/ports/{UserRepository,ConversationRepository,MessageRepository}.ts`
- 서비스: `src/core/services/CreateConversationService.ts`
- 인프라: `src/infra/repositories/{UserRepositoryMySQL,ConversationRepositoryMongo,MessageRepositoryMongo}.ts`

## 설계 포인트

- User는 MySQL, Conversation/Message는 MongoDB에 저장.
- 커서 페이징은 `_id` ASC 기준으로 `nextCursor` 반환.
- 에러는 서비스에서 `ValidationError` 등을 throw, 중앙 에러 미들웨어에서 RFC 9457로 직렬화.

## 확인 방법

- 타입체크/빌드: `npm run build`
- 런타임 검증: 서버 기동 후 `/healthz` OK 확인(도메인/포트/서비스는 현재 라우트에 직접 연결되진 않음)

## 후속 작업

- 컨트롤러 추가 및 OpenAPI 계약(/v1/conversations, /v1/conversations/{id}/messages) 반영
- 문제 응답(`application/problem+json`) 스키마 참조 일원화
- 서비스/리포지토리 단위/통합 테스트 작성
