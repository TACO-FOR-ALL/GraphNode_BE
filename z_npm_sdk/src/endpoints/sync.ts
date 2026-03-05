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
   * @param since - 마지막 동기화 시각 (ISO 8601). 생략 시 모든 데이터를 가져옵니다.
   * @returns 변경된 데이터 목록 및 서버 시각
   */
  pull(since?: string | Date): Promise<HttpResponse<SyncPullResponse>> {
    const sinceStr = since instanceof Date ? since.toISOString() : since;
    return this.rb.path('/v1/sync/pull').query({ since: sinceStr }).get<SyncPullResponse>();
  }

  /**
   * 서버로부터 변경된 대화 및 메시지 데이터를 가져옵니다.
   * @param since - 마지막 동기화 시각
   * @returns 변경된 대화/메시지 목록
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
   * @param since - 마지막 동기화 시각
   * @returns 변경된 노트/폴더 목록
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
   * @param data - 변경된 데이터 목록
   */
  push(data: SyncPushRequest): Promise<HttpResponse<{ success: boolean }>> {
    return this.rb.path('/v1/sync/push').post<{ success: boolean }>(data);
  }
}
