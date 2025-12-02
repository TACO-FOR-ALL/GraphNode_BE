export interface MessageDto {
  id: string; // FE generated UUID/ULID
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  deletedAt?: string | null; // ISO 8601
}

export interface MessageCreateDto {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface MessageUpdateDto {
  content?: string;
}
