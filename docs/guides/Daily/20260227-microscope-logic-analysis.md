---
layout: post
title: 2026-02-27-microscope-logic-analysis
date: 2026-02-27
tags: [BE, AI, FE, Database]
---

# Daily Dev Log: Microscope 로직 및 Neo4j 저장소/FE 연동 분석

## 1. TL;DR
- **목표**: AI Server의 Microscope 서비스 로직(인제스트, RAG 프로세스)과 Neo4j 사용 구조를 파악하고, BE 서비스와의 연동 및 로컬/클라우드 설정 방안, FE 측 화면 상태를 확인한다.
- **결과**:
  - `call.py` 및 여러 `service` 스크립트를 통해 인제스트 과정(문서 청크 분할 → 엔티티 추출 → VectorDB/Neo4j 병렬 저장)의 상세 로직을 분석 완료함.
  - Neo4j에는 `Entity` 노드, `Chunk` 노드, 그리고 `REL`(Entity 간) 및 `EXTRACTED_FROM`(Entity-Chunk 간) 엣지 형태로 데이터가 저장되는 스키마 구조 도출.
  - Frontend 코드(`GraphNode_FE/GraphNode_Front`)를 분석한 결과, 아직 Microscope나 RAG 전용 특화 페이지나 API(mock 데이터 포함)는 구현되어 있지 않으며, 현재는 범용적인 `Graph3D` 컴포넌트를 통해 기존 노드/클러스터만을 시각화하고 있음.
- **영향 범위**: 이후 구축될 BE `Neo4jGraphAdapter` 및 FE Microscope 페이지 설계에 기반 자료로 사용됨.

## 2. AI Server Microscope 핵심 흐름 분석

### 2.1 전체 시스템 파이프라인
Microscope 모듈은 문서를 지식 그래프로 치환하고, 이를 기반으로 벡터 검색과 그래프 확장을 조합한 질의응답 및 요약을 수행합니다.
- **인제스트 파이프라인 (`call.py`)**: 
  1. 입력 문서 텍스트를 로드하고 특정 사이즈(기본 800)로 **Chunk** 분할 (오버랩 150).
  2. 분할된 Chunk를 LLM에 전송하여 **Entity(엔티티)** 와 **Relation(관계)** 추출.
  3. 추출된 개체들을 기존에 저장된 노드 그룹 내에서 이름 및 타입 기준으로 **표준화(Standardize)**.
  4. 이후 표준화된 데이터를 VectorDB(Chroma)와 Neo4j에 동시 저장.
- **RAG 서비스 파이프라인 (`services/`)**:
  - `hybrid_rag_query_service`: Chroma에서 초기 청크 검색 → 초기 청크와 연관된 엔티티 획득 → Neo4j 로직 활용해 hop 수만큼 주변 엔티티 확장 → 관련된 모든 청크를 종합하여 LLM에 전달.
  - `synthesize_service`: 특정 주제 기반 요약 진행 (유사 검색/확장 구조 사용).
  - `rag_explain_path_service`: 두 엔티티 사이의 경로(최단 경로 등)를 Neo4j로 탐색하고, 소속된 청크 증거를 모아 설명 제공.
  - `related_questions_service`: 후속 질문 제안 생성.

### 2.2 Neo4j 데이터 저장 스키마 (`graphnode_repository.py`, `handler.py`)
이벤트 및 데이터를 저장할 때 Neo4j는 다음의 세 가지 핵심 구조를 갖습니다.

1. **`Entity` (개체 노드)**
   - Labels: `Entity`
   - Properties: `uuid`, `name`, `types`(배열), `descriptions`(배열), `source_ids`(배열), `user_id`, `group_id`
   - 식별: `user_id`와 `group_id`, 그리고 `name`의 결합을 통해 고유성 판단 (`MERGE (n:Entity {name:$name...})`).

2. **`Chunk` (문서 조각 노드)**
   - Labels: `Chunk`
   - Properties: `uuid`, `text`, `source_id`, `user_id`, `group_id`, `chunk_index`, `created_at`
   - 역할: VectorDB에 저장되는 텍스트 원본 및 임베딩과 동일한 라이프사이클을 가져가며, 명시적인 파편 단위로 Neo4j에 생성됨.

3. **Relationships (엣지/관계)**
   - **`REL`**: `(Entity)-[r:REL]->(Entity)`
     - Properties: `uuid`, `type`(관계유형명), `weight`, `source_ids`, `user_id`, `group_id`
   - **`EXTRACTED_FROM`**: `(Entity)-[:EXTRACTED_FROM]->(Chunk)`
     - Properties: 속성 없이 청크와 엔티티 간 참조 링크 역할용.

## 3. FE (GraphNode_Front) 코드 및 데이터 요구 파악

`GraphNode_FE/GraphNode_Front` 폴더 전체와 하위(`pages/`, `components/`, `routes/`, `store/`, `public/`)를 대상으로 관련 용어(`microscope`, `rag`, `neo4j`, `mock`)를 교차 검색하며 분석한 결과:

- **특화 레이아웃 및 Mocks 부재**: 현재 레포지토리상에 Microscope, RAG 질의 탭, 노드 Path 설명(Explain Path) 등을 시각화하기 위한 전용 컴포넌트나 화면 레이아웃(Mock JSON 파일 등)은 추가되어 있지 않습니다.
- **기존 `GraphSnapshot` 의존**: 현재 데이터를 화면에 표시하는 영역은 `src/components/visualize/Graph3D.tsx`나 `Graph2D.tsx` 모듈이며, 내부에는 `id`, `clusterId`, `source`, `target` 만을 포함하는 `GraphSnapshot` 데이터 배열을 파싱해 WebGL(d3-force-3d)로 띄우는 것이 전부입니다.
- **향후 요구사항 통찰**:
  Microscope에서 RAG 요청을 사용할 때 FE에서 띄워줄 데이터 형태는 기존 `GraphSnapshot`과는 다르게 설계되어야 합니다.
  - **Explain Path**: 노드 배열(`nodes`) 외에 순서가 명시된 관계 노선(`path_length`, `relationships`)을 반환해야 합니다.
  - **Synthesize/Query**: 응답 원문(TEXT) 외에 "증거 청크 리스트(`chunk_ids`, `extracted_text`)"가 추가되어야, 사용자가 답변의 근거를 확인하는 UI 컴포넌트를 만들 수 있습니다.

## 4. 백엔드(BE) 설계 방향성 제안
위 조사 내용에 따라 다음과 같이 BE Neo4j 인프라와 서비스를 설계해야 합니다.

1. **`Neo4jGraphAdapter` 구현 및 활성화**
   - 현재 코드상에 존재하는 `Neo4jGraphAdapter`(주석 처리됨)를 활성화하고, `MicroscopeRepository`를 신설해야 합니다.
   - 데이터 모델은 `handler.py`에서 파악한 바에 따라, `(Entity)-[REL]-(Entity)` 구조를 유지하여 쿼리 메서드(`getOneHopEdges`, `findShortestPath` 등)를 구현합니다.

2. **API 및 SDK 분리**
   - 백엔드 앱 영역(`src/app/routes`)에 `/v1/microscope/process` 라우트를 두고 AI 서버 통신 중개 파이프라인을 작성해야 합니다.
   - `GraphFeatures` DTO와 별개로, RAG 응답 및 경로 설명을 규정하는 `MicroscopeQueryResponseDto`, `ExplainPathResponseDto` 구조체를 작성하고 SDK에 노출시킬 필요가 있습니다.

## 5. 결론 및 Next Steps
- FE 측에는 아직 관련 데이터 요구 양식이나 렌더링 파일에 대한 준비가 이뤄지지 않았기 때문에, 백엔드(+ AI 연동)부터 API 스펙을 OpenAPI 기준으로 선행 정의하고, FE 팀에게 해당 형태소(응답 DTO)를 제공하여 UI 화면이 작성되도록 유도해야 합니다.
- 사용자가 설정한 Neo4j Cloud 구성 정보를 건네주시면, BE 서버의 환경변수(`.env`, ECS Tasks)를 연동하고 `Neo4jGraphAdapter`의 주석 해제와 연결 검증(Ping) 테스트를 진행하겠습니다.
