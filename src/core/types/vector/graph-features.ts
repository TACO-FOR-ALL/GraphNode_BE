/**
 * @module GraphFeatures
 * @description
 * AI 파이프라인(GrapeNode_AI)에서 생성된 features.json과 
 * 이를 Vector DB에 저장하기 위한 데이터 구조를 정의합니다.
 */

import { VectorItem } from '../../ports/VectorStore';

/**
 * [External DTO] AI Server Output (features.json)
 * features.json 파일의 구조를 정의합니다.
 * GraphGenerationResultHandler에서 다운로드 받은 데이터의 타입으로 사용됩니다.
 */
export interface GraphFeaturesJsonDto {
  conversations: Array<{
    id: number;
    orig_id: string; // UUID
    keywords: Array<{ term: string; score: number }>;
    create_time?: number;
    update_time?: number;
    num_sections: number;
    source_type: string;
  }>;
  embeddings: number[][]; // 2D array [index][dim]
  metadata: Record<string, any>;
}

/**
 * [Internal Metadata] Vector Payload
 * Vector DB(Chroma 등)의 'metadata' (payload) 필드에 저장될 구조입니다.
 * features.json의 conversations 항목과 1:1 매핑되어 검색 필터링에 사용됩니다.
 * 
 * [User Requirement] 
 * - 키 네이밍: snake_case (Python 스타일에 맞춤)
 */
export interface GraphNodeVectorMetadata {
  /** 사용자 ID (필터링 필수) */
  user_id: string;

  /** 백엔드 DB의 Conversation UUID (User-facing ID) */
  conversation_id: string;

  /** features.json의 'orig_id' (conversation_id와 동일) */
  orig_id: string;

  /** 생성된 그래프 내부의 노드 ID (Integer) - features.json의 'id' */
  node_id: number; // or string if needed

  /** 클러스터 ID (e.g. "cluster_1") - from graph_final.json */
  cluster_id: string;

  /** 클러스터 이름 (e.g. "Python Dev") - from graph_final.json */
  cluster_name: string;

  /** 키워드 목록 문자열 (쉼표 구분, e.g. "python,fastapi") */
  keywords: string;

  /** 생성 시각 (Epoch or ISO) */
  create_time: number | string;

  /** 메시지 수 */
  num_messages: number;

  /** 그 외 확장 필드 (Index signature for flexibility) */
  [key: string]: any;
}

/**
 * [Internal Domain Object] Vector Item
 * VectorStore Port에 전달하기 위한 구체적인 타입입니다.
 * VectorItem 인터페이스를 확장하여 metadata 타입을 구체화했습니다.
 */
export interface GraphNodeVectorItem extends VectorItem {
  id: string;      // Vector ID (usually UUID)
  vector: number[]; // Embedding Vector
  metadata: GraphNodeVectorMetadata; // Strongly typed metadata
}
