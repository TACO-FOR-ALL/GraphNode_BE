# 2026-04-29 Graph RAG 검색 엉뚱한 결과 반환 및 Neo4j 트랜잭션 충돌 에러

## 1. 개요
Graph RAG 환경의 의미 기반 검색 테스트( `/dev/test/search/graph-rag` ) 과정에서 두 가지 주요 문제가 발견되었습니다.
1. **Neo4j 트랜잭션 충돌 (500 Error)**: `Queries cannot be run directly on a session with an open transaction`
2. **검색 품질 저하 현상**: 검색어("금융투자")와 전혀 무관한 "주거 환경 영어 번역", "New chat" 등의 노드가 최상단에 검색됨.

이 문서에서는 각 문제의 발생 상황, 원인 및 해결 방법에 대한 분석을 기록합니다.

---

## 2. Neo4j Session & Transaction 충돌 에러
### 📌 상황
API 호출 중 간헐적 혹은 지속적으로 500 에러와 함께 다음과 같은 에러가 발생함.
`Neo4jError: Queries cannot be run directly on a session with an open transaction; either run from within the transaction or use a different session.`

### 🔍 원인 분석
- **Session의 비-스레드세이프(Non-Thread-Safe) 사용**: Neo4j 드라이버에서 `Session` 객체는 동시에 여러 쿼리나 트랜잭션을 처리할 수 없습니다.
- `Neo4jMacroGraphAdapter.ts`의 `searchGraphRagNeighbors` 또는 연관된 메서드 내에서 수동 트랜잭션(`session.beginTransaction()`)을 열어두고, 이 트랜잭션이 끝나기 전(`commit` 또는 `rollback`)에 동일한 세션에서 `session.run()`을 호출했거나,
- 병렬 비동기 처리(`Promise.all` 등) 과정에서 단일 Session을 재사용하면서 동시성 충돌이 발생한 것입니다.

### 💡 해결 방법 (예정)
- **Session 분리 및 관리 방식 변경**: 각 독립된 작업 단위마다 `driver.session()`을 새로 열고 닫도록 변경.
- **Managed Transaction 도입**: 수동 트랜잭션 대신 `session.executeRead(tx => ...)` 또는 `session.executeWrite(tx => ...)` 블록을 사용하여 드라이버가 트랜잭션 커밋과 세션 자원 정리를 안전하게 관리하도록 리팩토링.

---

## 3. Graph RAG 검색 결과 오염 (Garbage Results)
### 📌 상황
포스트맨으로 `{"userId": "...", "q": "금융투자", "limit": 10}`를 요청했으나, 반환된 `combinedScore`가 `23.7`대로 비정상적으로 높게 나타나며, 검색어와 전혀 무관한 노드(예: "주거 환경 영어 번역")가 상위에 랭크됨.

### 🔍 원인 분석
**1. 검색어 인코딩 깨짐 (Encoding Corruption)**
- 서버 로그를 확인한 결과, `"keyword":"旮堨湹韴瀽"`와 같이 파라미터가 심각하게 깨져 있는 것이 관찰되었습니다. 
- Windows(터미널의 CP949/EUC-KR) 환경과 Node.js(UTF-8) 간의 인코딩 불일치로 인해 로거(Pino)에 출력이 깨진 것일 수도 있지만, 만약 Express 파서나 로컬 호출 단계에서부터 이 깨진 문자열이 AI 임베딩 모델(HuggingFace `all-MiniLM-L6-v2`)로 전달되었다면, 전혀 무관한 벡터가 생성되어 엉뚱한 데이터를 검색하게 됩니다.

**2. ChromaDB 거리(Distance)와 유사도(Similarity) 점수의 역전 처리**
- ChromaDB는 기본적으로 벡터 간의 **거리(L2 Distance)** 를 반환합니다. 거리는 **낮을수록 유사도가 높은 것**을 의미합니다. (완전 동일할 경우 0)
- 반면 `SearchService.ts` 내의 스코어 결합 로직(Phase 4)을 보면:
  ```typescript
  // SeedOrigId -> vector score 맵 구축 후
  finalNodes.sort((a, b) => b.combinedScore - a.combinedScore); // 내림차순 정렬
  ```
  현재 코드는 ChromaDB의 L2 거리를 '유사도 점수'로 착각하여 **값이 큰(거리가 제일 멀고 관련 없는) 노드를 검색결과 상위(1등)로 올려버리는 치명적 논리 오류**를 범하고 있습니다. 거리가 23.7과 같이 멀리 떨어진 노드들이 상위권에 뽑힌 이유가 바로 이 정렬 방향의 오류 때문입니다.

### 💡 해결 방법 (예정)
- **Score 정규화 (역산 처리)**: ChromaDB에서 얻어온 거리(distance) 값을 `1 / (1 + distance)`나 `max_distance - distance` 등의 방식으로 **값이 클수록 유사한 점수(Similarity Score)**로 변환한 뒤 `SearchService`에 전달하도록 수정.
- **정렬 로직 수정 혹은 L2 거리 기반 오름차순 반영**: 만약 점수가 거리라면 `a.combinedScore - b.combinedScore` 형태의 오름차순으로 랭킹 알고리즘을 변경해야 함.
- **인코딩 검증 테스트**: 한글 입력이 Express 서버 내부 컨트롤러와 임베딩 서비스(`hf-inference`) 사이에 전달될 때 실제로 인코딩이 정상적으로 보존되는지 디버깅용 로그(`Buffer` 값 출력 등)를 추가하여 점검.
