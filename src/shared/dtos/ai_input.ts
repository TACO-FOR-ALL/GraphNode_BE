
/**
 * AI 모듈에서 
 */
export interface AiInputMessageContent {
  content_type: 'text';
  parts: string[];
}

/**
 * AI 모듈에서 사용되는 입력 양식 중 작성자 정보
 * 작성자의 역할을 나타냅니다.
 * 'role' 필드는 'user', 'assistant', 'system' 중 하나의 값을 가질 수 있습니다.
 * - 'user': 사용자가 보낸 메시지
 * - 'assistant': AI 어시스턴트가 생성한 메시지
 * - 'system': 시스템 메시지 또는 지침
 * @property role - 작성자의 역할
 */
export interface AiInputMessageAuthor {
  role: 'user' | 'assistant' | 'system';
}

/**
 * AI 모듈에서 Input 메시지 형식
 * AI 서버에 전송되는 메시지의 구조를 정의합니다.
 * - id: 메시지의 고유 식별자
 * - author: 메시지를 작성한 작성자 정보
 * - content: 메시지의 실제 내용
 * @property id - 메시지의 고유 식별자
 * @property author - 메시지를 작성한 작성자 정보
 * @property content - 메시지의 실제 내용
 */
export interface AiInputMessage {
  id: string;
  author: AiInputMessageAuthor;
  content: AiInputMessageContent;
}

/**
 * AI 모듈에서 사용되는 매핑 노드 형식
 * 대화 내의 각 메시지를 트리 구조로 표현합니다.
 * - id: 노드의 고유 식별자
 * - message: 해당 노드에 연결된 메시지 정보
 * - parent: 부모 노드의 식별자 (없을 경우 null)
 * - children: 자식 노드들의 식별자 배열
 * @property id - 노드의 고유 식별자
 * @property message - 해당 노드에 연결된 메시지 정보
 * @property parent - 부모 노드의 식별자 (없을 경우 null)
 * @property children - 자식 노드들의 식별자 배열
 */
export interface AiInputMappingNode {
  id: string;
  message: AiInputMessage | null;
  parent: string | null;
  children: string[];
}

/**
 * AI 모듈에서 사용되는 대화 형식
 * 대화의 메타데이터와 메시지 매핑을 포함합니다.
 * - title: 대화의 제목
 * - create_time: 대화 생성 시간 (Unix 타임스탬프, 초 단위)
 * - update_time: 대화 마지막 업데이트 시간 (Unix 타임스탬프, 초 단위)
 * - mapping: 메시지 매핑 정보 (노드 ID를 키로 하는 매핑 노드 객체)
 */
export interface AiInputConversation {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, AiInputMappingNode>;
}

export type AiInputData = AiInputConversation[];
