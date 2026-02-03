import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { SyncPushRequest, SyncPullResponse } from '../types/sync.js';

/**
 * Sync API
 *
 * 클라이언트와 서버 간의 데이터 동기화를 처리하는 API 클래스입니다.
 * `/v1/sync` 엔드포인트 하위의 API들을 호출합니다.
 *
 * 주요 기능:
 * - 변경 사항 가져오기 (Pull) (`pull`)
 * - 변경 사항 보내기 (Push) (`push`)
 *
 * @public
 */
export class SyncApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 서버로부터 변경된 데이터를 가져옵니다 (Pull).
   * @param since - 마지막 동기화 시각 (ISO 8601). 생략 시 모든 데이터를 가져옵니다.
   * @returns 변경된 데이터 목록 및 서버 시각
   *    - `conversations` (ConversationDto[]): 변경된 대화 목록
   *    - `messages` (MessageDto[]): 변경된 메시지 목록
   *    - `notes` (NoteDto[]): 변경된 노트 목록
   *    - `folders` (FolderDto[]): 변경된 폴더 목록
   *    - `serverTime` (string): 서버 현재 시각 (ISO 8601) - 다음 동기화 커서로 사용
   * @example
   * const lastSyncTime = '2023-10-27T10:00:00Z';
   * const response = await client.sync.pull(lastSyncTime);
   * console.log(response.data);
   * // Output:
   * {
   *   conversations: [
   *     { id: 'c_123', title: 'New Chat', ... }
   *   ],
   *   messages: [
   *     { id: 'm_456', content: 'Hello', ... }
   *   ],
   *   notes: [],
   *   folders: [],
   *   serverTime: '2023-10-27T12:00:00Z' // Use this for next sync
   * }
   */
  pull(since?: string | Date): Promise<HttpResponse<SyncPullResponse>> {
    const sinceStr = since instanceof Date ? since.toISOString() : since;
    return this.rb.path('/v1/sync/pull').query({ since: sinceStr }).get<SyncPullResponse>();
  }

  /**
   * 클라이언트의 변경 사항을 서버로 전송합니다 (Push).
   * @param data - 변경된 데이터 목록
   *    - `conversations` (ConversationDto[], optional): 변경된 대화 목록
   *    - `messages` (MessageDto[], optional): 변경된 메시지 목록 (conversationId 포함)
   *    - `notes` (NoteDto[], optional): 변경된 노트 목록
   *    - `folders` (FolderDto[], optional): 변경된 폴더 목록
   * @example
   * await client.sync.push({
   *   conversations: [
   *     { id: 'c_1', title: 'Updated Title', updatedAt: '2024-02-20T10:00:00Z' }
   *   ],
   *   messages: [
   *     { id: 'm_1', conversationId: 'c_1', content: 'New message', role: 'user' }
   *   ]
   * });
   * console.log('Sync push completed');
   */
  push(data: SyncPushRequest): Promise<HttpResponse<{ success: boolean }>> {
    return this.rb.path('/v1/sync/push').post<{ success: boolean }>(data);
  }
}
