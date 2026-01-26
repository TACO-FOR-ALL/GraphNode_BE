import { z } from 'zod';

/**
 * 모듈: 동기화 관련 Zod 스키마
 *
 * 책임:
 * - Sync API 요청 데이터(Push)의 구조와 타입을 런타임에 검증합니다.
 * - 클라이언트가 보낸 데이터가 서버의 기대 형식과 일치하는지 확인합니다.
 */

// --- AI Schemas ---

/**
 * 채팅 메시지 스키마
 * - id: 메시지 고유 ID
 * - role: user | assistant | system
 * - content: 메시지 내용
 * - createdAt, updatedAt: ISO 8601 날짜 문자열
 * - deletedAt: 삭제된 경우 날짜 문자열, 아니면 null/undefined
 */
const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

/**
 * 채팅 스레드(대화방) 스키마
 * - messages: 해당 대화방에 포함된 메시지 목록
 */
const chatThreadSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.iso.datetime().optional(),
  deletedAt: z.iso.datetime().nullable().optional(),
  messages: z.array(chatMessageSchema),
});

/**
 * 동기화용 메시지 스키마
 * - conversationId가 포함되어 있어, 어떤 대화방의 메시지인지 식별 가능합니다.
 */
const syncMessageSchema = chatMessageSchema.extend({
  conversationId: z.string(),
});

// --- Note Schemas ---

/**
 * 노트 스키마
 * - folderId: 폴더에 속한 경우 폴더 ID, 루트인 경우 null
 */
const noteSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  title: z.string(),
  content: z.string(),
  folderId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

/**
 * 폴더 스키마
 * - parentId: 상위 폴더 ID, 루트인 경우 null
 */
const folderSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

// --- Sync Push Schema ---

export const syncPushSchema = z.object({
  conversations: z.array(chatThreadSchema).optional(),
  messages: z.array(syncMessageSchema).optional(),
  notes: z.array(noteSchema).optional(),
  folders: z.array(folderSchema).optional(),
});

export type SyncPushSchema = z.infer<typeof syncPushSchema>;
