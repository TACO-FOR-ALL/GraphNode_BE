import { z } from 'zod';

/**
 * 모듈: AI DTO Schemas (데이터 검증 스키마)
 *
 * 책임:
 * - 클라이언트로부터 들어오는 요청 데이터(Request Body)의 구조와 타입을 정의하고 검증합니다.
 * - Zod 라이브러리를 사용하여 런타임 유효성 검사를 수행합니다.
 * - 검증된 데이터의 타입(TypeScript Type)을 추출하여 컨트롤러 등에서 사용할 수 있게 합니다.
 *
 * 이 파일은 'Shared' 레이어에 위치하여, 여러 모듈에서 공통으로 사용될 수 있습니다.
 */

/**
 * 대화방 생성 요청 스키마
 *
 * 필수: id, title
 * 선택: messages (초기 메시지 목록)
 */
export const createConversationSchema = z.object({
  id: z.string().min(1, 'ID는 필수입니다'), // 서버 생성 지원
  title: z.string().min(1, '제목은 필수입니다').max(200, '제목은 200자를 넘을 수 없습니다'),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).optional(), // 서버 생성 지원
        role: z.enum(['user', 'assistant', 'system']), // 허용된 역할만 가능
        content: z.string().min(1, '메시지 내용은 필수입니다'),
        // ts 제거, createdAt/updatedAt은 서버에서 처리
      })
    )
    .optional(),
});

/**
 * 대화방 대량 생성 요청 스키마
 *
 * conversations 배열 안에 createConversationSchema 구조의 객체들을 담습니다.
 */
export const bulkCreateConversationsSchema = z.object({
  conversations: z.array(createConversationSchema),
});

/**
 * 대화방 수정 요청 스키마
 *
 * 현재는 제목(title) 수정만 지원합니다.
 */
export const updateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

/**
 * 메시지 생성 요청 스키마
 *
 * 필수: id, role, content
 */
export const createMessageSchema = z.object({
  id: z.string().min(1).optional(), // 서버 생성 지원
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  // ts 제거
});

/**
 * 메시지 수정 요청 스키마
 *
 * 역할(role)이나 내용(content)을 수정할 수 있습니다.
 */
export const updateMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).optional(),
  content: z.string().min(1).optional(),
});

// Zod 스키마로부터 TypeScript 타입을 추출하여 내보냅니다.
// 이를 통해 스키마와 타입의 일관성을 자동으로 유지할 수 있습니다.
export type CreateConversationRequest = z.infer<typeof createConversationSchema>;
export type UpdateConversationRequest = z.infer<typeof updateConversationSchema>;
export type BulkCreateConversationsRequest = z.infer<typeof bulkCreateConversationsSchema>;
export type CreateMessageRequest = z.infer<typeof createMessageSchema>;
export type UpdateMessageRequest = z.infer<typeof updateMessageSchema>;
