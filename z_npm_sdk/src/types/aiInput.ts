/**
 * AI 모듈 입력 데이터 DTO 정의
 * @packageDocumentation
 */

/**
 * 메시지 내용
 * @public
 */
export interface AiInputMessageContent {
  content_type: 'text';
  parts: string[];
}

/**
 * 메시지 작성자 정보
 * @public
 */
export interface AiInputMessageAuthor {
  role: 'user' | 'assistant' | 'system';
}

/**
 * AI 입력 메시지 구조
 * @public
 */
export interface AiInputMessage {
  id: string;
  author: AiInputMessageAuthor;
  content: AiInputMessageContent;
}

/**
 * 대화 트리 매핑 노드
 * @public
 */
export interface AiInputMappingNode {
  id: string;
  message: AiInputMessage | null;
  parent: string | null;
  children: string[];
}

/**
 * AI 입력 데이터 (대화 스레드)
 * @public
 */
export interface AiInputData {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, AiInputMappingNode>;
}
