import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  SyncPushRequest,
  SyncPullResponse,
  SyncPullConversationsResponse,
  SyncPullNotesResponse,
} from '../types/sync.js';

/**
 * Sync API
 *
 * 클라이언트와 서버 간의 데이터 동기화를 처리하는 API 클래스입니다.
 * `/v1/sync` 엔드포인트 하위의 API들을 호출합니다.
 *
 * 주요 기능:
 * - 변경 사항 가져오기 (Pull) (`pull`)
 * - 개별 변경 사항 가져오기 (`pullConversations`, `pullNotes`)
 * - 변경 사항 보내기 (Push) (`push`)
 *
 * @public
 */
export class SyncApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 서버로부터 변경된 모든 데이터를 가져옵니다 (Pull).
   * 
   * @param since - 마지막 동기화 시각 (ISO 8601 string 또는 Date 객체). 
   *                **생략하거나 null을 전달하면 사용자의 모든 활성 데이터를 처음부터 가져옵니다 (Full Sync).**
   * @returns 변경된 데이터 목록 (Conversations, Messages, Notes, Folders) 및 서버 시각
   * 
   * @example
   * // 1. 전체 데이터 동기화 (최초 실행 시)
   * const res = await client.sync.pull();
   * 
   * // 2. 특정 시점 이후 변경 사항만 동기화
   * const res = await client.sync.pull('2024-03-12T00:00:00Z');
   */
  pull(since?: string | Date): Promise<HttpResponse<SyncPullResponse>> {
    const sinceStr = since instanceof Date ? since.toISOString() : since;
    return this.rb.path('/v1/sync/pull').query({ since: sinceStr }).get<SyncPullResponse>();
  }

  /**
   * 서버로부터 변경된 대화 및 메시지 데이터를 가져옵니다.
   * 
   * @param since - 마지막 동기화 시각. 
   *                **생략 시 모든 대화/메세지 데이터를 가져옵니다.**
   * @returns 변경된 대화/메시지 목록
   * 
   * @example
   * const res = await client.sync.pullConversations(lastSyncDate);
   * if (res.isSuccess) {
   *   console.log('Modified Conversations:', res.data.conversations.length);
   * }
   */
  pullConversations(since?: string | Date): Promise<HttpResponse<SyncPullConversationsResponse>> {
    const sinceStr = since instanceof Date ? since.toISOString() : since;
    return this.rb
      .path('/v1/sync/pull/conversations')
      .query({ since: sinceStr })
      .get<SyncPullConversationsResponse>();
  }

  /**
   * 서버로부터 변경된 노트 및 폴더 데이터를 가져옵니다.
   * 
   * @param since - 마지막 동기화 시각. 
   *                **생략 시 모든 노트/폴더 데이터를 가져옵니다.**
   * @returns 변경된 노트/폴더 목록
   * 
   * @example
   * const res = await client.sync.pullNotes('2024-01-01');
   */
  pullNotes(since?: string | Date): Promise<HttpResponse<SyncPullNotesResponse>> {
    const sinceStr = since instanceof Date ? since.toISOString() : since;
    return this.rb
      .path('/v1/sync/pull/notes')
      .query({ since: sinceStr })
      .get<SyncPullNotesResponse>();
  }

  /**
   * 클라이언트의 변경 사항을 서버로 전송합니다 (Push).
   * 
   * @remarks
   * 이 메서드는 LWW(Last Write Wins) 정책에 따라 서버 데이터를 업데이트합니다. 
   * 여러 엔티티의 변경 사항을 한 번의 트랜잭션으로 일괄 처리하며, 오프라인 상태에서 발생한 변경 내역을 동기화할 때 유용합니다.
   * 
   * @param data - 변경된 데이터 목록 (nodes, conversations, messages, folders 등)
   * @returns 성공 여부
   * 
   * @example
   * await client.sync.push({
   *   notes: [{ id: 'note_1', title: 'Updated Title', content: '...', updatedAt: new Date().toISOString() }],
   *   conversations: []
   * });
   */
  push(data: SyncPushRequest): Promise<HttpResponse<{ success: boolean }>> {
    return this.rb.path('/v1/sync/push').post<{ success: boolean }>(data);
  }
}
