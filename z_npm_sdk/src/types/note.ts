/**
 * Note DTO
 */
export interface NoteDto {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Folder DTO
 */
export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Note Create DTO
 */
export interface NoteCreateDto {
  title?: string;
  content: string;
  folderId?: string | null;
}

/**
 * Note Update DTO
 */
export interface NoteUpdateDto {
  title?: string;
  content?: string;
  folderId?: string | null;
}

/**
 * Folder Create DTO
 */
export interface FolderCreateDto {
  name: string;
  parentId?: string | null;
}

/**
 * Folder Update DTO
 */
export interface FolderUpdateDto {
  name?: string;
  parentId?: string | null;
}
