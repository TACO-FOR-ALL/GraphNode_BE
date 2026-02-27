# 작업 상세 문서 — FE SDK Graph Status Tracking 타입 변경 공지

## 📌 메타 (Meta)
- **작성일**: 2026-02-28 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **스코프 태그**: [FE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 프론트엔드 개발자가 최신 API 변경사항인 `GraphStatus` 값의 사용처와 `getStats`의 변경된 반환 타입, `generateGraph(options)` 및 `addNode(options)` 함수의 옵션 인자들을 쉽게 참고할 수 있도록 가이드를 제공합니다.
- **결과:** FE SDK에 `GraphStatus` 타입이 노출되어 사용될 수 있으며, `GenerateGraphOptions` 옵션을 문서화 하였습니다.

---

## 🔧 상세 변경 내용 (FrontEnd SDK)

### 1. `GraphStatus` 타입 추가
프론트엔드에서 그래프 AI 처리 이벤트를 뷰 기반으로 매핑할 수 있도록 `GraphStatus`가 노출됩니다.
- 경로: `z_npm_sdk/src/types/graph.ts`
```typescript
/**
 * 그래프 백엔드 처리 상태.
 */
export type GraphStatus = 'NOT_CREATED' | 'CREATING' | 'CREATED' | 'UPDATING' | 'UPDATED';
```

이 코드는 주로 `client.graph.getStats()` 응답 객체 및 `client.graph.getSnapshot()`의 `stats` 객체 내부 상태 멤버로 전달됩니다. 사용자가 아직 아무런 AI 처리를 진행하지 않았다면 404가 나오지 않고 기본 `NOT_CREATED` 값이 하위 멤버를 0으로 통일한 채 반환됩니다.

### 2. `generateGraph` / `addNode` 의 Options 파라미터 구조
- 대상 함수: `client.graphAi.generateGraph()` / `client.graphAi.addNode()`
- 해당 함수 호출 시 파라미터에 들어갈 수 있는 `options` 타입을 명확히 정의하였습니다.
```typescript
// z_npm_sdk/src/types/graphAi.ts
export interface GenerateGraphOptions {
  /**
   * 그래프 처리(생성 또는 노드 추가) 완료 후 요약(Summary) 단계를 연달아 수행할지 여부를 결정합니다. 기본값은 true입니다.
   * 이 값이 true일 경우, 백엔드에서 그래프 생성이 성공적으로 완료되면 백그라운드 워커가 자동으로 Summary 작업을 대기열(Queue)에 추가합니다.
   */
  includeSummary?: boolean;
}
```

프론트엔드에서 명시적으로 `{ includeSummary: false }` 를 보내면 Summary를 자동으로 대기열에 담지 않게 됩니다.

### 3. README 업데이트
SDK의 `README.md` 에 옵션의 의미와 새롭게 추가된 `status` 반환 객체가 명시되었습니다. 프론트엔드 코드 내 타입 오류나 타입 단언을 피하기 위해, 개발 전 `npm run build` 등의 과정을 통해 최신 NPM 패키지 SDK 의존성을 다시 맞추시거나 컴파일 환경을 재점검 바랍니다.

---

## 📜 변경 이력
- v1.0 (2026-02-28): 가이드 최초 작성
