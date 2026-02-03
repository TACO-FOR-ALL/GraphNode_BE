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
    num_messages: number;
  }>;
  embeddings: number[][]; // 2D array [index][dim]
  metadata: Record<string, any>;
}

/**
 * [Internal Metadata] Vector Payload
 * Vector DB(Chroma 등)의 'metadata' (payload) 필드에 저장될 구조입니다.
 * features.json의 conversations 항목과 1:1 매핑되어 검색 필터링에 사용됩니다.
 */
export interface GraphNodeVectorMetadata {
  /** 원본 대화 ID (UUID) - features.json의 'orig_id' */
  origId: string;
  
  /** 생성된 그래프 내부의 노드 ID (Integer) - features.json의 'id' */
  nodeId: number;
  
  /** 사용자 ID (소유자) */
  userId: string;
  
  /** 키워드 목록 (검색 필터링용) - features.json의 'keywords'에서 term만 추출 */
  keywords: string[];

  /** 키워드 상세 정보 (Retrieve용) - term과 score를 포함한 객체 배열의 JSON 문자열 */
  keywordDetails?: string; 
  
  /** 대화 내 메시지 수 - features.json의 'num_messages' */
  messageCount?: number;
  
  /** 생성 시각 (Timestamp or ISO) - features.json의 'create_time' */
  createTime?: number | string;
  
  /** 갱신 시각 (Timestamp or ISO) - features.json의 'update_time' */
  updateTime?: number | string;

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
