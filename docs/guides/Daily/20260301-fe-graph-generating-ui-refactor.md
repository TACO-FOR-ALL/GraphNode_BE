# 작업 상세 문서 — FE 그래프 렌더링 상태 동기화 및 무한 로딩 버그 수정

## 📌 메타 (Meta)
- **작성일**: 2026-03-01 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **스코프 태그**: [FE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 프론트엔드 환경에서 그래프 생성 요청 대기 중, 새로고침이나 재접속 시 무한 로딩(생성 중 UI)에 멈춰있는 버그를 해결합니다.
- **결과:** 
  - 상태 관리(`zustand`)에서 영속성(`persist`) 미들웨어를 제거하여 로컬 상태를 휘발성으로 변경했습니다.
  - SDK를 통해 백엔드의 실제 그래프 처리 상태(`GraphStatus`) 값을 가져오고, 이에 따라 정확하게 생성 중 UI를 표출하도록 `EmptyGraph` 컴포넌트를 개선했습니다.
- **영향 범위:** 프론트엔드 그래프 뷰어 화면(`Visualize.tsx`, `EmptyGraph.tsx`), 그래프 전역 상태(`useGraphGenerationStore.ts`) 및 타입 정의(`GraphData.ts`)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 그래프 생성이 완료되었으나 SSE 단절 등 알림 유실로 인해, 로컬 스토리지에 남아있던 `isGenerating: true` 상태가 영구 유지되어 계속 빈 화면(생성 중)만 띄워주는 문제를 해결해야 합니다.
- 폴링(Polling) 방식 대신, 뷰 진입 시 백엔드의 현재 그래프 상태(`CREATING`, `UPDATING` 등)를 확인하여 스마트하게 분기하는 방식으로 UI를 개선합니다.

### 사전 조건/선행 작업
- 프론트엔드 전용 SDK(`@taco_tsinghua/graphnode-sdk`) 버전이 `GraphStatus` 타입을 정상적으로 `export` 하도록 업데이트 및 링크되어 있어야 합니다.

---

## 📦 산출물

### 📄 수정된 파일
- `src/store/useGraphGenerationStore.ts` — `persist` 미들웨어 제거.
- `src/types/GraphData.ts` — SDK로부터 `GraphStatus` 임포트 및 `GraphStats` 타입 확장.
- `src/components/visualize/EmptyGraph.tsx` — 백엔드 상태(`status`) 프로퍼티 추가 및 렌더링 조건 수정.
- `src/routes/Visualize.tsx` — 조회한 그래프 통계의 `status`를 `EmptyGraph`로 주입 전달.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/store/useGraphGenerationStore.ts`
- **`useGraphGenerationStore`**
  - 기존에 존재했던 `zustand/middleware`의 `persist` 래핑 함수를 제거했습니다.
  - 이는 `isGenerating` 플래그가 페이지 새로고침 시에도 유지되는 것을 막고, 오로지 현재 세션의 메모리 상태로만 존재하게끔 합니다.

#### `src/types/GraphData.ts`
- **`GraphStats` (인터페이스 수정)**
  - 엔드포인트 SDK(`@taco_tsinghua/graphnode-sdk`) 에 정의된 `GraphStatus` 타입을 가져와 `status?: GraphStatus;` 필드를 선언하였습니다.

#### `src/components/visualize/EmptyGraph.tsx`
- **`EmptyGraph` (로직 개선)**
  - 기존 전역시점 데이터인 `useGraphGenerationStore`의 `isGenerating` 값을 `isStoreGenerating`으로 네이밍을 구분했습니다.
  - 상위에서 주입받는 `status` 프로퍼티 값을 확인하여, 로컬 스토어 값이 true이거나, **백엔드의 실제 상태가 `CREATING` 또는 `UPDATING`일 경우**에만 생성 중(Loading Animation) UI를 렌더링하도록 조건을 수정했습니다.

#### `src/routes/Visualize.tsx`
- **`Visualize` (의존성 주입)**
  - 쿼리로 받아온 `graphData.nodeEdgeData.stats?.status` 값을 평가하여 `EmptyGraph` 컴포넌트의 프로퍼티에 인계하는 로직을 추가했습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Frontend (React, Zustand)

### ▶ 실행
```bash
# GraphNode_Front 디렉토리 환경에서 프론트엔드 서버를 시작합니다.
npm run dev
```

### 🧪 검증
1. 앱 진입 후 "그래프 분석 시작하기" (생성 요청) 버튼을 클릭합니다.
2. 로딩 애니메이션이 등장하면 F5를 눌러 새로고침을 시도합니다.
3. 백엔드에서 아직 열심히 생성 중(`CREATING`)이라면, 로컬 상태가 날아갔음에도 백엔드 상태를 받아와 다시 로딩 애니메이션을 정상적으로 띄우는지 확인합니다.
4. 백엔드 생성이 멈췄거나(에러 등으로 `NOT_CREATED`) 완료되었다면 빈 페이지 혹은 완성된 그래프가 렌더링되는지 확인합니다.

---

## 🛠 구성 / 가정 / 제약
- 뷰 접근 시(`getSnapshot` 등) 백엔드에서 내려주는 그래프 통계 객체(`rules`) 내부 혹은 최상단에 `status: GraphStatus` 형태의 값이 유효하게 존재함을 전제로 작동합니다.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- 과거 `GraphStatus` 타입이 SDK의 `index.ts`에 의해 외부 패키지에 노출되지 않아 빌드/TS에러가 존재했었으나, 해당 타입은 SDK 단독 패치에서 같이 해결되었습니다.

---

## 🔜 다음 작업 / TODO
- [ ] SSE 이벤트 유실 뿐 아니라 어플리케이션이 아예 꺼져있었을 때를 대비해, 접속/재연결 시 수행 중인 백그라운드 프로세스가 있는지 초기 파악하는 폴백 프로시저 개발 고려.

---

## 📜 변경 이력
- v1.0 (2026-03-01): 최초 작성
