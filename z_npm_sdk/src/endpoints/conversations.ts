import { RequestBuilder, type HttpResponse, type HttpResponseError } from '../http-builder.js';
import type {
  ConversationDto,
  ConversationCreateDto,
  ConversationUpdateDto,
  ConversationBulkCreateDto,
} from '../types/conversation.ts';
import type { MessageCreateDto, MessageUpdateDto, MessageDto } from '../types/message.js';

/**
 * Conversations API
 *
 * AI와의 대화(Conversation) 및 메시지(Message)를 관리하는 API 클래스입니다.
 * `/v1/ai/conversations` 엔드포인트 하위의 API들을 호출합니다.
 *
 * 주요 기능:
 * - 대화 생성, 조회, 수정, 삭제 (`create`, `get`, `list`, `update`, `delete`)
 * - 대화 일괄 생성 (`bulkCreate`)
 * - 삭제된 대화 복원 (`restore`)
 * - 메시지 추가 (`createMessage`)
 *
 * @public
 */
export class ConversationsApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 새로운 대화를 생성합니다.
   * @param dto 대화 생성 요청 데이터
   *    - `title` (string): 대화 제목
   *    - `id` (string, optional): 대화 ID (클라이언트 생성 시)
   *    - `messages` (MessageCreateDto[], optional): 초기 메시지 목록
   * @returns 생성된 대화 정보
   *    - `id` (string): 대화 ID
   *    - `title` (string): 제목
   *    - `messages` (MessageDto[]): 메시지 목록
   *    - `createdAt` (string): 생성 일시
   *    - `updatedAt` (string): 수정 일시
   *
   * **응답 상태 코드:**
   * - `201 Created`: 대화 생성 성공
   * - `400 Bad Request`: title이 비어있거나 데이터 형식이 잘못됨
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.create({
   *   title: 'Project Brainstorming',
   *   messages: [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'Let\'s brainstorm some ideas.' }
   *   ]
   * });
   *
   * console.log(response.data);
   * // Output:
   *  {
   *    id: 'conv-123',
   *    title: 'Project Brainstorming',
   *    messages: [
   *      { id: 'msg-1', role: 'system', content: '...', createdAt: '...' },
   *      { id: 'msg-2', role: 'user', content: '...', createdAt: '...' }
   *    ],
   *    createdAt: '2023-10-27T10:00:00Z',
   *    updatedAt: '2023-10-27T10:00:00Z'
   *  }
   */
  create(dto: ConversationCreateDto): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path('/v1/ai/conversations').post<ConversationDto>(dto);
  }

  /**
   * 여러 대화를 일괄 생성합니다.
   * @param dto 일괄 생성 요청 데이터
   *    - `conversations` (ConversationCreateDto[]): 생성할 대화 목록
   * @returns 생성된 대화 목록
   *
   * **응답 상태 코드:**
   * - `201 Created`: 일괄 생성 성공
   * - `400 Bad Request`: 데이터 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.bulkCreate({
   *   conversations: [
   *     {
   *       title: 'Chat 1',
   *       messages: [{ role: 'user', content: 'Hello' }]
   *     },
   *     {
   *       title: 'Chat 2',
   *       messages: [{ role: 'user', content: 'Hi there' }]
   *     }
   *   ]
   * });
   *
   * console.log(response.data);
   * // Output:
   * {
   *   conversations: [
   *     {
   *       id: 'conv-1',
   *       title: 'Chat 1',
   *       messages: [{ id: 'msg-1', role: 'user', content: 'Hello', ... }],
   *       createdAt: '2023-10-27T10:00:00Z',
   *       updatedAt: '2023-10-27T10:00:00Z'
   *     },
   *     {
   *       id: 'conv-2',
   *       title: 'Chat 2',
   *       messages: [{ id: 'msg-2', role: 'assistant', content: 'Hi there', ... }],
   *       createdAt: '2023-10-27T10:00:00Z',
   *       updatedAt: '2023-10-27T10:00:00Z'
   *     }
   *   ]
   * }
   */
  bulkCreate(
    dto: ConversationBulkCreateDto
  ): Promise<HttpResponse<{ conversations: ConversationDto[] }>> {
    return this.rb
      .path('/v1/ai/conversations/bulk')
      .post<{ conversations: ConversationDto[] }>(dto);
  }

  /**
   * 대화 목록을 조회합니다. (모든 페이지 자동 조회)
   * @returns 대화 목록 (ConversationDto 배열)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (데이터가 없으면 빈 배열 반환)
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * const response = await client.conversations.list();
   * console.log(response.data); // 모든 대화 목록
   */
  async list(): Promise<HttpResponse<ConversationDto[]>> {
    const allItems: ConversationDto[] = [];
    let cursor: string | null = null;

    do {
      const res: HttpResponse<{ items: ConversationDto[]; nextCursor: string | null }> =
        await this.rb
          .path('/v1/ai/conversations')
          .query({ limit: 100, cursor: cursor || undefined })
          .get<{ items: ConversationDto[]; nextCursor: string | null }>();

      if (!res.isSuccess) {
        return res as HttpResponseError;
      }

      allItems.push(...res.data.items);
      cursor = res.data.nextCursor;
    } while (cursor);

    return {
      isSuccess: true,
      statusCode: 200,
      data: allItems,
    };
  }

  /**
   * 삭제된 대화(휴지통) 목록을 조회합니다. (모든 페이지 자동 조회)
   * @returns 삭제된 대화 목록 (ConversationDto 배열)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (데이터가 없으면 빈 배열 반환)
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * const response = await client.conversations.listTrash();
   * console.log(response.data); // 모든 삭제된 대화 목록
   */
  async listTrash(): Promise<HttpResponse<ConversationDto[]>> {
    const allItems: ConversationDto[] = [];
    let cursor: string | null = null;

    do {
      const res: HttpResponse<{ items: ConversationDto[]; nextCursor: string | null }> =
        await this.rb
          .path('/v1/ai/conversations/trash')
          .query({ limit: 100, cursor: cursor || undefined })
          .get<{ items: ConversationDto[]; nextCursor: string | null }>();

      if (!res.isSuccess) {
        return res as HttpResponseError;
      }

      allItems.push(...res.data.items);
      cursor = res.data.nextCursor;
    } while (cursor);

    return {
      isSuccess: true,
      statusCode: 200,
      data: allItems,
    };
  }

  /**
   * 특정 대화를 조회합니다.
   * @param conversationId 대화 ID
   * @returns 대화 상세 정보
   *    - `id` (string): 대화 ID
   *    - `title` (string): 제목
   *    - `messages` (MessageDto[]): 메시지 목록
   *    - `createdAt` (string): 생성 일시
   *    - `updatedAt` (string): 수정 일시
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.get('conv-123');
   *
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'conv-123',
   *   title: 'Project Brainstorming',
   *   messages: [
   *     { id: 'msg-1', role: 'user', content: 'Hello', createdAt: '...' }
   *   ],
   *   createdAt: '2023-10-27T10:00:00Z',
   *   updatedAt: '2023-10-27T10:00:00Z'
   * }
   */
  get(conversationId: string): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).get<ConversationDto>();
  }

  /**
   * 대화 정보를 수정합니다 (제목 등).
   * @param conversationId 대화 ID
   * @param patch 수정할 데이터
   *    - `title` (string, optional): 변경할 제목
   * @returns 수정된 대화 정보
   *
   * **응답 상태 코드:**
   * - `200 OK`: 수정 성공
   * - `400 Bad Request`: 제목이 비어있거나 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.update('conv-123', {
   *   title: 'Renamed Conversation'
   * });
   *
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'conv-123',
   *   title: 'Renamed Conversation',
   *   messages: [...],
   *   createdAt: '...',
   *   updatedAt: '...'
   * }
   */
  update(
    conversationId: string,
    patch: ConversationUpdateDto
  ): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).patch<ConversationDto>(patch);
  }

  /**
   * 대화를 소프트 삭제합니다 (휴지통으로 이동).
   * @param conversationId 대화 ID
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * await client.conversations.softDelete('conv-123');
   */
  softDelete(conversationId: string): Promise<HttpResponse<{ ok: true }>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}`)
      .query({ permanent: false })
      .delete<{ ok: true }>();
  }

  /**
   * 대화를 영구 삭제합니다.
   *
   * @remarks
   * **경고:** 이 작업은 취소할 수 없습니다. 이 대화를 기반으로 생성된 지식 그래프(Graph Node/Edge) 데이터들 또한 함께 영구 삭제됩니다.
   *
   * @param conversationId - 대화 ID
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 영구 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * await client.conversations.hardDelete('conv-123');
   */
  hardDelete(conversationId: string): Promise<HttpResponse<{ ok: true }>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}`)
      .query({ permanent: true })
      .delete<{ ok: true }>();
  }

  /**
   * 모든 대화를 삭제합니다.
   *
   * @remarks
   * **주의:** 사용자의 모든 대화 내역 및 연관된 지식 그래프 데이터가 즉시 파기됩니다.
   *
   * @returns 삭제된 대화 수
   *
   * **응답 상태 코드:**
   * - `200 OK`: 삭제 성공. `{ deletedCount: number }` 반환
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * const response = await client.conversations.deleteAll();
   * console.log(response.data.deletedCount); // 5
   */
  async deleteAll(): Promise<HttpResponse<{ deletedCount: number }>> {
    return this.rb.path('/v1/ai/conversations').delete<{ deletedCount: number }>();
  }

  /**
   * 삭제된 대화를 복구합니다.
   * 주의: 이 대화를 기반으로 생성되었던 지식 그래프(Graph Node/Edge) 데이터들 또한 연쇄 복구(Cascade Restore) 됩니다.
   * @param conversationId 대화 ID
   * @returns 복구된 대화 정보
   *
   * **응답 상태 코드:**
   * - `200 OK`: 복구 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 ID의 대화가 존재하지 않거나 소프트 삭제된 상태가 아님
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.restore('conv-123');
   *
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'conv-123',
   *   title: 'Restored Conversation',
   *   messages: [...],
   *   createdAt: '...',
   *   updatedAt: '...'
   * }
   */
  restore(conversationId: string): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/restore`).post<ConversationDto>({});
  }

  // Messages nested under conversation

  /**
   * 대화에 메시지를 추가합니다.
   * @param conversationId 대화 ID
   * @param dto 메시지 생성 요청 데이터
   *    - `role` ('user' | 'assistant' | 'system'): 메시지 역할
   *    - `content` (string): 메시지 내용
   *    - `id` (string, optional): 메시지 ID (클라이언트 생성 시)
   * @returns 생성된 메시지 정보
   *    - `id` (string): 메시지 ID
   *    - `role` (string): 역할
   *    - `content` (string): 내용
   *    - `createdAt` (string): 생성 일시
   *
   * **응답 상태 코드:**
   * - `201 Created`: 메시지 생성 성공
   * - `400 Bad Request`: 내용이 비어있거나 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.createMessage('conv-123', {
   *   role: 'user',
   *   content: 'Tell me a joke about programming.'
   * });
   *
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'msg-999',
   *   role: 'user',
   *   content: 'Tell me a joke about programming.',
   *   createdAt: '...'
   * }
   */
  createMessage(conversationId: string, dto: MessageCreateDto): Promise<HttpResponse<MessageDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/messages`).post<MessageDto>(dto);
  }

  /**
   * 메시지를 수정합니다.
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   * @param patch 수정할 데이터
   *    - `content` (string, optional): 변경할 내용
   * @returns 수정된 메시지 정보
   *
   * **응답 상태 코드:**
   * - `200 OK`: 수정 성공
   * - `400 Bad Request`: 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 메시지 또는 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.updateMessage('conv-123', 'msg-999', {
   *   content: 'Tell me a joke about Python.'
   * });
   *
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'msg-999',
   *   role: 'user',
   *   content: 'Tell me a joke about Python.',
   *   createdAt: '...'
   * }
   */
  updateMessage(
    conversationId: string,
    messageId: string,
    patch: MessageUpdateDto
  ): Promise<HttpResponse<MessageDto>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`)
      .patch<MessageDto>(patch);
  }

  /**
   * 메시지를 소프트 삭제합니다 (휴지통으로 이동).
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 메시지 또는 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * await client.conversations.softDeleteMessage('conv-123', 'msg-999');
   */
  softDeleteMessage(
    conversationId: string,
    messageId: string
  ): Promise<HttpResponse<{ ok: true }>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`)
      .query({ permanent: false })
      .delete<{ ok: true }>();
  }

  /**
   * 메시지를 영구 삭제합니다.
   *
   * @remarks
   * **경고:** 이 작업은 취소할 수 없습니다.
   *
   * @param conversationId - 대화 ID
   * @param messageId - 메시지 ID
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 영구 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 메시지 또는 대화가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * await client.conversations.hardDeleteMessage('conv-123', 'msg-999');
   */
  hardDeleteMessage(
    conversationId: string,
    messageId: string
  ): Promise<HttpResponse<{ ok: true }>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`)
      .query({ permanent: true })
      .delete<{ ok: true }>();
  }

  /**
   * 삭제된 메시지를 복구합니다.
   *
   * @remarks
   * 메시지 복구 시, 이 메시지를 기반으로 생성되었던 지식 그래프 노드(Graph Node)도 함께 연쇄 복원됩니다.
   *
   * @param conversationId - 대화 ID
   * @param messageId - 메시지 ID
   * @returns 복구된 메시지 정보
   *
   * **응답 상태 코드:**
   * - `200 OK`: 복구 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 메시지가 존재하지 않거나 소프트 삭제된 상태가 아님
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const response = await client.conversations.restoreMessage('conv-123', 'msg-999');
   */
  restoreMessage(conversationId: string, messageId: string): Promise<HttpResponse<MessageDto>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}/restore`)
      .post<MessageDto>({});
  }
}
