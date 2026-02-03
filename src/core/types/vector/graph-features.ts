import { VectorItem } from '../../ports/VectorStore';

/**
 * Vector DB에 저장되는 개별 대화(Node)의 메타데이터 구조
 * features.json의 conversations 항목과 매핑됩니다.
 */
export interface GraphNodeVectorMetadata {
  /** 원본 대화 ID (UUID) - features.json의 'orig_id' */
  origId: string;
  
  /** 생성된 그래프 내부의 노드 ID (Integer) - features.json의 'id' */
  nodeId: number;
  
  /** 키워드 목록 (검색 필터링용) - features.json의 'keywords'에서 term만 추출 */
  keywords: string[];
  
  /** 대화 내 메시지 수 - features.json의 'num_messages' */
  messageCount?: number;
  
  /** 생성 시각 (Timestamp or ISO) - features.json의 'create_time' */
  createTime?: number | string;
  
  /** 갱신 시각 (Timestamp or ISO) - features.json의 'update_time' */
  updateTime?: number | string;

  /** 그 외 확장 필드 */
  [key: string]: any;
}

/**
 * 그래프 노드 벡터 아이템
 * VectorStore.upsert에 전달하기 위한 구체적인 타입입니다.
 */
export interface GraphNodeVectorItem extends VectorItem {
  metadata: GraphNodeVectorMetadata;
}
