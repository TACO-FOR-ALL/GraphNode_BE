---
title: "Microscope Neo4j Data Flow 및 인터페이스/쿼리 교정 결과 정리"
date: "2026-02-27"
author: "AI Agent"
scope: "[BE], [AI]"
---

## 1. `group_id` 와 `source_id` 의 명확한 역할 정의

질문하신 내용이 **정확히 맞습니다**.
*   **`group_id`**: 프로젝트나 지식베이스의 상위 "폴더" 개념입니다. 서로 다른 여러 파일들이라도 같은 `group_id`로 인제스트를 보내면 모두 동일한 지식 그래프 공간을 공유하게 되어 상호 연결(RAG) 쿼리가 가능해집니다.
*   **`source_id`**: 그 폴더(`group_id`) 안에서 개별적으로 구별되는 **"특정 문서 하나"**의 주민번호입니다. (예: 어떤 Entity 속성의 이름이 "GraphNode"일 때, 이를 증명하는 Chunk나 EXTRACTED_FROM 출처 등을 역추적할 때 쓰입니다.)

## 2. Neo4j의 '컬렉션(Collection)' 개념과 쿼리 정합성(Composite Keys) 교정

**Neo4j에서의 Collection 분리 방식 분석:**
MongoDB의 Database/Collection 구조와 달리, Neo4j(일반 버전) 하나의 데이터베이스 안에서는 **"Label (라벨)"** 기능을 통해 컬렉션을 개념적으로 분리합니다. 
AI 서버가 이미 **`Entity`**, **`Chunk`** 라는 라벨을 달아 노드를 저장하기 때문에, 이 라벨 자체가 **"Microscope 전용 컬렉션"** 역할을 100% 수행하고 있습니다. (기존 일반 그래프는 `Node`, `Cluster` 라벨 사용)

**위험한 쿼리 오류 교정 완료:**
이전의 어댑터 코드에서는 Entity를 찾을 때 `uuid`나 `name`만 사용하도록 쿼리가 작성되어 있어, 만약 A유저와 B유저가 우연히 같은 이름의 엔티티를 가질 경우 시스템 전역에서 **데이터 충돌이나 무작위 병합(침범)이 발생**할 수 있는 치명적인 구멍이 있었습니다. 

AI 서버의 실제 로직(`handler.py`)을 정밀 추적한 결과, 병합(MERGE)의 기준점으로 삼는 **유일성 복합키(Composite Keys)**는 `{name, user_id, group_id}` 였습니다.
따라서, 백엔드 `Neo4jGraphAdapter.ts`의 Cypher 구조를 완전히 갈아엎어 **Microscope 컬렉션 내에서 완벽한 데이터 격리**를 이루도록 다음과 같이 수정/조치 완료했습니다:

*   **`upsertMicroscopeEntityNode`**: `MERGE (n:Entity {name: $props.name, user_id: $props.user_id, group_id: $props.group_id})` 로 변경.
*   **`upsertMicroscopeChunkNode`**: `MERGE (c:Chunk {uuid: $uuid, user_id: $props.user_id, group_id: $props.group_id})` 로 변경.
*   **`upsertMicroscopeRelEdge`**: Entity 양 끝점을 연결할 때 글로벌 공간 전체를 뒤지지 않도록 `MATCH (s:Entity {user_id: $props.user_id, group_id: $props.group_id}) ... MATCH (t:Entity ...)` 로 한정 후 엣지를 생성하도록 쿼리 전면 수정 적용 완료.
*   문자열 띄어쓰기 문법 오류가 없도록 정적 분석 처리까지 통과시켰습니다.

## 3. Microscope 전체 로직/데이터 파이프라인 흐름 설명

전체 처리 흐름은 아래와 같이 유기적으로 작동합니다:

**Step 1. 문서 인제스트 요청 (BE -> AI Worker)**
1. 클라이언트가 S3에 PDF/MD/TXT 문서를 업로드합니다.
2. BE 서버는 문서의 S3 위치와 `group_id`, `user_id`를 담아 SQS 큐 `MICROSCOPE_INGEST_REQUEST` 메시지를 발송합니다.
3. 이때, 여러 문서들을 하나의 공통된 `group_id` 로 묶어서 순차적으로 큐에 보낸다면, AI 서버는 이들 문서를 하나하나 같은 지식 공간으로 융합(RAG)시킵니다.

**Step 2. AI 서버 문서 처리 및 파싱 (`microscope/call.py`)**
1. AI Worker는 S3에서 문서를 로드하고, 텍스트를 청크(Chunk) 단위로 분할합니다. 지정된 각 청크에는 순서값(`chunk_index`)이 매겨집니다.
2. 시스템 내부적으로 이 단일 문서를 기념하는 고유 UUID인 **`source_id`**가 발급됩니다. 전체 청크가 이 출처 `source_id`를 나누어 갖게 됩니다.
3. 청크들을 로컬 임베딩 모델(`all-mpnet-base-v2` 등)을 이용해 Chroma(VectorDB)에 우선 적재합니다. 

**Step 3. LLM 그래프 추출 및 병합 (Neo4j 데이터 적재)**
1. 각 텍스트 청크를 강력한 LLM(Groq-Llama)에 던져서, 본문 안의 핵심 [개념/명사]를 **`Entity`** 노드로, 이들 간 관계망(지식 그래프)을 **`REL`** 엣지로 추출합니다.
2. AI 서버는 이 추출된 결과를 Neo4j 그래프 데이터베이스에 밀어 넣습니다.
   - 이때 기존 문서에서 만들어져있던 `Entity` (예: "비트코인")가 새로운 문서 청크에서도 발견되었다면? `user_id`와 `group_id`를 키로 하여 **동일한 노드 하나로 병합(MERGE)** 하고, 해당 노드의 `source_ids` 배열에 방금 발급된 새 `source_id`를 추가로 이어 붙입니다.
   - 이로 인해, 하나의 개체 노드가 **"여러 문서 출처(`source_id` 1번, 2번)에서 공통 발견된 거대한 뇌 신경망"**으로 자라나게 됩니다.

**Step 4. 결과 응답 (AI Worker -> BE)**
1. 문서 하나에 대해 모든 Entity 조립 및 VectorDB 저장이 끝납니다.
2. AI 서버가 SQS를 통해 응답(`MICROSCOPE_INGEST_RESULT`)을 BE로 보냅니다.
3. BE 환경(`GraphNode/src/workers/handlers/` 등)에서는 `source_id`, 해당 문서가 쪼개진 `chunks_count` 등의 통계를 전달받으며 인제스트 사이클이 끝납니다. 
   - BE의 `Neo4jGraphAdapter.ts`는 이렇게 완성된 지식 구조를 훗날 서비스 API 등에서 수정, 조회, 삭제할 때 안전한 창구(격리 보장)로써 작동하게 됩니다.

---
**[결론]** DB 쿼리 문법의 구멍을 완전히 닫았으며, BE/AI 환경 간 Microscope Collection 논리적 고립(격리) 처리가 일원화되었습니다.
