# Database Architecture

> 마지막 갱신: 2026-04-29

GraphNode Backend는 데이터의 특성에 따라 **Polyglot Persistence** 전략으로 다수의 저장소를 혼용합니다.  
클라우드 DB 안정성을 위해 지수 백오프 기반 [재시도 정책](retry-policy.md)이 전 계층에 적용됩니다.

---

## Polyglot Persistence 전략

| 저장소 | 역할 | 이유 |
|---|---|---|
| **PostgreSQL** (Prisma) | 사용자 계정 · 일일 사용량 · 온보딩 정보 · 피드백 | 관계형 정합성, 트랜잭션 보장 |
| **MongoDB** (Mongoose) | 대화 · 메시지 · 노트 · 폴더 · Microscope · Macro Graph | 비정형 문서 데이터의 유연한 확장성 |
| **Neo4j** | Macro Graph Native 구조, Graph RAG 이웃 탐색 | 노드-관계 구조 명시적 표현, 홉 탐색 성능 |
| **ChromaDB** | 384차원 MiniLM 임베딩 벡터 저장 및 유사도 검색 | Seed 노드 추출 (Graph RAG Phase 1) |
| **Redis** | 세션 · 실시간 알림 큐 · 캐시 · Rate Limit | 빠른 읽기/쓰기, TTL 기반 알림 제어 |
| **S3** (JSON) | Microscope 대용량 그래프 데이터, AI 분석 중간 산출물 | 16MB+ 페이로드 MongoDB 분리 저장 |

---

## 분리 문서 빠른 참조

| 문서 | 내용 |
|---|---|
| [`DATABASE_ERD.md`](DATABASE_ERD.md) | ERD 다이어그램 전체 — Core/Files, Microscope, Macro Graph, Vector DB |
| [`DATABASE_SCHEMA_PG.md`](DATABASE_SCHEMA_PG.md) | PostgreSQL 상세 스키마 — Users, DailyUsage, UserInfo, Feedback |
| [`DATABASE_SCHEMA_MONGO.md`](DATABASE_SCHEMA_MONGO.md) | MongoDB 상세 스키마 — Conversation, Message, Note, Graph, Microscope 등 |
| [`DATABASE_NEO4J.md`](DATABASE_NEO4J.md) | Neo4j 그래프 모델 + Graph RAG 파이프라인 (스코어 공식, Cypher 전략) |

---

## Vector DB (ChromaDB 메타데이터)

**소스**: `src/core/types/vector/graph-features.ts`  
**컬렉션**: `macro_node_all_minilm_l6_v2`  
**임베딩 모델**: `all-MiniLM-L6-v2` (384차원)

ChromaDB에 임베딩과 함께 저장되는 메타데이터 필드입니다. 키 네이밍은 Python 스타일(`snake_case`)을 따릅니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| **user_id** | `String` | 사용자 ID (필터링 필수) |
| **conversation_id** | `String` | 원본 대화 ID (UUID) |
| **orig_id** | `String` | 원본 ID (ConversationDoc/NoteDoc의 _id) |
| **node_id** | `Number` | 그래프 노드 ID (GraphNodeDoc.id 정수형, Optional) |
| **cluster_id** | `String` | 클러스터 ID (Optional) |
| **cluster_name** | `String` | 클러스터 이름 (Optional) |
| **cluster_confidence** | `String` | 클러스터링 신뢰도 (Optional) |
| **keywords** | `String` | 검색용 키워드 (쉼표 구분, Optional) |
| **create_time** | `Number \| String` | 생성 시각 (Epoch 또는 ISO, Optional) |
| **num_sections** | `Number` | 섹션 또는 메시지 개수 (Optional) |

---

## Object Storage (S3 JSON)

대용량 그래프 데이터 및 AI 분석 결과는 S3 버킷에 JSON 파일로 보관합니다.

- **Payload Bucket**: AI 서버의 최종 분석 결과 (`standardized.json`, `graph_final.json` 등)
- **Log/Debug**: 파이프라인 중간 산출물

분석 결과는 `MicroscopeManagementService`를 통해 사용자별로 관리하며, 네트워크 지연 대비 `withRetry` 유틸리티로 재시도를 적용합니다.
