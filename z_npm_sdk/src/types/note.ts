/**
 * Note DTO
 * @public
 * @property id 노트 ID (UUID)
 * @property title 노트 제목
 * @property content 노트 내용 (Markdown)
 * @property folderId 폴더 ID (null이면 최상위)
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 * @property deletedAt 삭제 일시 (ISO 8601, null이면 활성)
 */
export interface NoteDto {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Folder DTO
 * @public
 * @property id 폴더 ID (UUID)
 * @property name 폴더 이름
 * @property parentId 상위 폴더 ID (null이면 최상위)
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 * @property deletedAt 삭제 일시 (ISO 8601, null이면 활성)
 */
export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Note Create DTO
 * @public
 * @property id 노트 ID (UUID) - 클라이언트 생성
 * @property title 노트 제목 (선택)
 * @property content 노트 내용
 * @property folderId 폴더 ID (선택)
 */
export interface NoteCreateDto {
  id: string;
  title?: string;
  content: string;
  folderId?: string | null;
}

/**
 * Note Update DTO
 * @public
 * @property title 노트 제목 (선택)
 * @property content 노트 내용 (선택)
 * @property folderId 폴더 ID (선택)
 */
export interface NoteUpdateDto {
  title?: string;
  content?: string;
  folderId?: string | null;
}

/**
 * Folder Create DTO
 * @public
 * @property name 폴더 이름
 * @property parentId 상위 폴더 ID (선택)
 */
export interface FolderCreateDto {
  name: string;
  parentId?: string | null;
}

/**
 * Folder Update DTO
 * @public
 * @property name 폴더 이름 (선택)
 * @property parentId 상위 폴더 ID (선택)
 */
export interface FolderUpdateDto {
  name?: string;
  parentId?: string | null;
}
