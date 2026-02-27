/**
 * Microscope Neo4j Persistence Types
 * 
 * Microscope RAG 기능을 위한 Neo4j 데이터베이스 저장 구조(Entity, Chunk, REL)를 정의합니다.
 * (이 파일의 인터페이스들은 MongoDB의 Document 스키마가 아니라 Neo4j 전용 스키마임을 나타냅니다.)
 */

/**
 * 'Entity' Label을 가진 개체 노드.
 * (AI 섭취 과정을 통해 추출된 엔티티)
 * 
 * @property uuid - 엔티티 고유 ID
 * @property name - 엔티티 이름
 * @property types - 엔티티 유형 목록
 * @property descriptions - 추출된 설명 목록
 * @property chunk_ids - 추출된 원본 청크의 고유 ID 목록
 * @property source_ids - 추출된 원본 소스 문서 ID 목록
 * @property user_id - 사용자 ID
 * @property group_id - 그룹 ID
 * @property created_at - 생성 시간
 * @property updated_at - 수정 시간
 */
export interface MicroscopeEntityNode {
  uuid: string;
  name: string;
  types: string[];
  descriptions: string[];
  chunk_ids: string[];
  source_ids: string[];
  user_id: string;
  group_id: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * 'Chunk' Label을 가진 문서 조각 노드.
 * 
 * @property uuid - 청크 고유 ID (VectorDB와 일치)
 * @property text - 청크 텍스트 본문
 * @property source_id - 원본 문서 식별자
 * @property chunk_index - 문서 내 청크 순서
 * @property user_id - 사용자 ID
 * @property group_id - 그룹 ID
 */
export interface MicroscopeChunkNode {
  uuid: string;
  text: string;
  source_id: string;
  chunk_index: number;
  user_id: string;
  group_id: string;
  created_at?: string;
}

/**
 * 'REL' Type을 가진 개체 간의 관계 엣지.
 * 
 * @property uuid - 엣지 고유 ID
 * @property type - 구조화된 관계 명칭
 * @property weight - 가중치
 * @property source_ids - 연관 문서의 출처 노드 id
 * @property user_id - 사용자 ID
 * @property group_id - 그룹 ID
 * @property start - 출발지 엔티티 네임 (또는 id)
 * @property target - 목적지 엔티티 네임 (또는 id)
 */
export interface MicroscopeRelEdge {
  uuid: string;
  type: string;
  weight: number;
  source_ids: string[];
  user_id: string;
  group_id: string;
  start: string;
  target: string;
  created_at?: string;
  updated_at?: string;
}
