/**
 * AI 모듈 입력 데이터 DTO 정의
 * @packageDocumentation
 */

/**
 * 메시지 내용
 *
 * 메시지의 실제 콘텐츠를 담고 있습니다. 현재는 텍스트 타입만 지원합니다.
 * @public
 */
export interface AiInputMessageContent {
  /**
   * 콘텐츠 타입 (고정값: 'text')
   */
  content_type: 'text';
  /**
   * 메시지 본문 내용의 배열. 보통 하나의 문자열 요소를 가집니다.
   */
  parts: string[];
}

/**
 * 메시지 작성자 정보
 *
 * 메시지를 누가 작성했는지 나타냅니다.
 * @public
 */
export interface AiInputMessageAuthor {
  /**
   * 작성자의 역할
   * - `user`: 사용자
   * - `assistant`: AI 모델
   * - `system`: 시스템 프롬프트
   */
  role: 'user' | 'assistant' | 'system';
}

/**
 * AI 입력 메시지 구조
 *
 * 개별 메시지의 상세 정보를 담는 객체입니다.
 * @public
 */
export interface AiInputMessage {
  /**
   * 메시지 고유 ID
   */
  id: string;
  /**
   * 작성자 정보
   */
  author: AiInputMessageAuthor;
  /**
   * 메시지 내용
   */
  content: AiInputMessageContent;
}

/**
 * 대화 트리 매핑 노드
 *
 * 대화의 흐름(트리 구조)을 표현하기 위한 노드 객체입니다.
 * 각 노드는 메시지 정보와 부모/자식 관계를 가집니다.
 * @public
 */
export interface AiInputMappingNode {
  /**
   * 노드 ID (메시지 ID와 동일)
   */
  id: string;
  /**
   * 해당 노드의 메시지 데이터. 루트 노드 등 일부 경우 null일 수 있음.
   */
  message: AiInputMessage | null;
  /**
   * 부모 노드의 ID. 대화의 시작점인 경우 null.
   */
  parent: string | null;
  /**
   * 자식 노드 ID들의 배열. 대화의 분기를 표현합니다.
   */
  children: string[];
}

/**
 * AI 입력 데이터 (대화 스레드)
 *
 * 하나의 대화 스레드 전체를 나타내는 최상위 객체입니다.
 * ChatGPT 데이터 내보내기 포맷과 호환됩니다.
 * @public
 */
export interface AiInputData {
  /**
   * 대화 제목
   */
  title: string;
  /**
   * 생성 시간 (Unix Timestamp, 초 단위)
   */
  create_time: number;
  /**
   * 마지막 업데이트 시간 (Unix Timestamp, 초 단위)
   */
  update_time: number;
  /**
   * 메시지 노드들의 맵 (Key: 노드 ID, Value: 노드 객체)
   * 대화의 전체 구조를 담고 있습니다.
   */
  mapping: Record<string, AiInputMappingNode>;
}
