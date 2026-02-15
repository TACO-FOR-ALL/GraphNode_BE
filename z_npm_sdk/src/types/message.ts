/**
 * 메시지(Message) DTO
 * @public
 * @property id 메시지 ID (UUID/ULID)
 * @property role 메시지 역할 ('user' | 'assistant' | 'system')
 * @property content 메시지 내용
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 * @property deletedAt 삭제 일시 (ISO 8601, null이면 활성)
 */
/**
 * 첨부파일 DTO
 * @public
 */
export interface Attachment {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * 메시지(Message) DTO
 * @public
 * @property id 메시지 ID (UUID/ULID)
 * @property role 메시지 역할 ('user' | 'assistant' | 'system')
 * @property content 메시지 내용
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 * @property deletedAt 삭제 일시 (ISO 8601, null이면 활성)
 * @property attachments 첨부파일 목록 (선택)
 */
export interface MessageDto {
  id: string; // FE generated UUID/ULID
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  deletedAt?: string | null; // ISO 8601
  attachments?: Attachment[];
}

/**
 * 메시지 생성 요청 DTO
 * @public
 * @property id 메시지 ID (선택, 클라이언트 생성 시)
 * @property role 메시지 역할
 * @property content 메시지 내용
 */
export interface MessageCreateDto {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 메시지 수정 요청 DTO
 * @public
 * @property content 변경할 메시지 내용 (선택)
 */
export interface MessageUpdateDto {
  content?: string;
}
