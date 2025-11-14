export interface MessageDto {
  id: string; // FE generated UUID/ULID
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string; // RFC3339
}

export interface MessageCreateDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
}

export interface MessageUpdateDto {
  content?: string;
}
