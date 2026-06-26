/**
 * Notion의 Rich Text 객체를 나타내는 DTO입니다.
 *
 * @public
 * @property type 텍스트 타입 (주로 'text')
 * @property plain_text 서식이 제거된 일반 텍스트
 * @property href 텍스트에 연결된 링크 주소 (선택적)
 * @property annotations 텍스트 서식 정보 (볼드, 이탤릭체 등)
 * @property text 내부 텍스트 콘텐츠 정보
 */
export interface NotionRichTextDTO {
  type: string;
  plain_text: string;
  href: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  text?: {
    content: string;
    link: { url: string } | null;
  };
}

/**
 * Notion 페이지 또는 블록의 부모 객체 정보를 나타내는 DTO입니다.
 *
 * @public
 * @property type 부모 객체의 타입 ('workspace', 'page_id', 'database_id' 등)
 */
export interface NotionPageParentDTO {
  type: string;
  [key: string]: unknown;
}

/**
 * Notion 페이지 객체를 나타내는 DTO입니다.
 *
 * @public
 * @property id 페이지의 고유 ID
 * @property object 객체 타입 (항상 'page')
 * @property type 페이지 타입
 * @property parent 페이지의 부모 정보
 * @property has_children 하위 요소(블록) 존재 여부
 * @property archived 페이지 삭제(보관) 여부
 * @property created_time 페이지 생성 시간 (ISO 8601)
 * @property last_edited_time 페이지 마지막 수정 시간 (ISO 8601)
 * @property title 페이지의 제목을 나타내는 Rich Text 배열
 */
export interface NotionPageDTO {
  id: string;
  object: string;
  type: string;
  parent: NotionPageParentDTO;
  has_children: boolean;
  archived: boolean;
  created_time: string;
  last_edited_time: string;
  title: NotionRichTextDTO[];
}

/**
 * Notion 루트 페이지 목록 조회 응답 DTO입니다.
 *
 * @public
 * @property results 페이지 목록 배열
 */
export interface NotionPagesResponseDTO {
  results: NotionPageDTO[];
}

/**
 * Notion 블록 객체를 나타내는 DTO입니다.
 *
 * @public
 * @property id 블록의 고유 ID
 * @property object 객체 타입 (항상 'block')
 * @property type 블록 타입 ('paragraph', 'heading_1' 등)
 * @property has_children 하위 블록 존재 여부
 * @property archived 블록 삭제(보관) 여부
 * @property created_time 블록 생성 시간 (ISO 8601)
 * @property last_edited_time 블록 마지막 수정 시간 (ISO 8601)
 */
export interface NotionBlockDTO {
  id: string;
  object: string;
  type: string;
  has_children: boolean;
  archived?: boolean;
  created_time?: string;
  last_edited_time?: string;
  [key: string]: unknown;
}

/**
 * Notion 하위 블록 목록 조회 응답 DTO입니다.
 *
 * @public
 * @property results 블록 목록 배열
 * @property next_cursor 다음 페이지 조회를 위한 커서 값 (없을 경우 null)
 * @property has_more 다음 페이지 존재 여부
 */
export interface NotionBlocksResponseDTO {
  results: NotionBlockDTO[];
  next_cursor: string | null;
  has_more: boolean;
}
