---
date: 2026-02-26
author: AI Agent
tags: [BE, AI, Graph]
---

# 대화 삭제 시 지식 그래프 연쇄 삭제 적용 (Chat-Graph Cascade Delete)

## 🎯 TL;DR (요약)
- **목표**: 사용자가 대화(Conversation)나 메시지(Message)를 삭제/복원할 때, 해당 메시지를 기반으로 생성된 지식 그래프 노드(Graph Node)와 연결된 엣지(Edge)들도 자동으로 함께 삭제/복원되도록 강제하는 연쇄 처리(Cascade) 규칙 적용.
- **결과**: `ChatManagementService`에 `GraphManagementService`를 주입하여, 대화/메시지 삭제 및 복원 트랜잭션 도중 원본 ID(`origId`)를 기준으로 그래프 요소들을 찾아 동일하게 Soft/Hard Delete 혹은 복원을 수행합니다.
- **영향 범위**: `GraphRepositoryMongo`, `GraphManagementService`, `ChatManagementService`, `Container`, `z_npm_sdk/src/endpoints/conversations.ts`(JSDoc 추가).

## 🛠 상세 변경 사항

### 1. `GraphRepositoryMongo` & 인터페이스 확장
- **추가**: `deleteNodesByOrigIds(userId, origIds, permanent, options)`
- **추가**: `restoreNodesByOrigIds(userId, origIds, options)`
- **설명**: 배열 형태의 `origIds`(메시지 ID 등 원본 식별자)를 입력받아 조건에 맞는 노드들을 검색한 후, 추출된 `nodeIds`(숫자형 ID)를 기준으로 노드와 관련된 엣지들을 한 번에 연쇄 삭제 및 복원하는 로직을 추가했습니다.

### 2. `GraphManagementService` 공개 API 추가
- `GraphRepository`에 위임하는 `deleteNodesByOrigIds` 및 `restoreNodesByOrigIds` 메서드를 노출하여 다른 서비스 영역에서 활용 가능하도록 개방했습니다.

### 3. `ChatManagementService` 내 연쇄 호출 (Cascade)
- **주입 추가**: `GraphManagementService`를 생성자 DI.
- **`deleteConversation`**: 메시지 삭제 처리 이후 추출한 `messageIds` 목록을 `deleteNodesByOrigIds`에 넘겨 그래프도 영구 삭제 여부(`permanent`)에 따라 삭제합니다.
- **`restoreConversation`**: 대화방 복구 후 `restoreNodesByOrigIds`를 호출하여 그래프 노드 복원.
- **`deleteMessage` / `restoreMessage`**: 단일 메시지 삭제/복원 시에도 해당 `messageId` 단 하나를 배열화하여 연쇄 삭제/복원 수행.
- **`deleteAllConversations`**: 계정 전체 대화 지우기 시나리오에서 `graphManagementService.deleteGraph(..., true)` 호출을 발생시켜 그래프의 완전 소거도 보장.

### 4. 의존성 역전 컨테이너 (`Container`) 갱신
- `getChatManagementService()` 생성부에 `this.getGraphManagementService()`를 세 번째 인자로 추가 주입.

### 5. Frontend SDK (`z_npm_sdk`) 문서화
- **JSDoc 업데이트**: `conversations.ts`의 `delete`, `deleteAll`, `restore`, `deleteMessage`, `restoreMessage` 메서드 주입에 해당 작업 수행 시 지식 그래프 데이터 또한 연쇄 삭제/복원됨을 경고하는 문구를 추가(Docs-as-code).

## 💡 실행/온보딩
해당 로직은 기존 삭제 API에 트랜잭션으로 편입되므로, 백엔드는 다음과 같이 평상시처럼 빌드/실행할 수 있습니다. 
```bash
npm run build
npm start
```

## ⚠️ 커스텀/가정/제약 및 리스크
- 현재 연쇄 삭제는 `origId`(문자열형) 값과 연결된 노드의 숫자형 `id`를 역으로 추적하여 `deleteMany`, `updateMany`를 수행합니다. 
- 이 로직은 `ChatManagementService`에서 `GraphManagementService`를 아는 **단방향 의존성**을 가집니다. 따라서 향후 반대 방향으로 모듈이 꼬이지 않도록 (Graph에서 Chat을 참조하지 않도록) 주의가 요구됩니다.

## 🚀 다음 단계 (Next Steps)
- 실제 프로덕션에서 발생할 수 있는 SQS 기반 AI 워커 스레드의 비동기 작업 도중에 원본 메시지가 지워질 경우 어떻게 처리할지를 포함한 Edge Case 보강 시나리오 등을 고려할 수 있습니다.
