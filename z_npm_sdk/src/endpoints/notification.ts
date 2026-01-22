import { RequestBuilder } from '../http-builder.js';

/**
 * Notification API
 * 
 * 사용자 알림 및 실시간 이벤트 스트림을 관리하는 API 클래스입니다.
 * `/v1/notifications` 엔드포인트 하위의 API들을 사용합니다.
 * 
 * 주요 기능:
 * - 실시간 알림 스트림 URL 조회 (`getStreamUrl`)
 * 
 * @public
 */
export class NotificationApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/notifications');
  }

  /**
   * 실시간 알림 수신을 위한 SSE(Server-Sent Events) 스트림 URL을 반환합니다.
   * 
   * 이 엔드포인트는 `text/event-stream` 형식으로 데이터를 스트리밍합니다.
   * 클라이언트는 `EventSource` API를 사용하여 연결해야 합니다.
   * 
   * 참고:
   * - 이 메서드는 HTTP 요청을 수행하지 않고, 연결 가능한 URL 문자열만 반환합니다.
   * - 세션 기반 인증을 사용하므로, 브라우저의 `EventSource`가 쿠키를 전송하도록 설정해야 합니다.
   * 
   * @returns SSE 연결을 위한 전체 URL 문자열
   * @example
   * const url = client.notification.getStreamUrl();
   * const eventSource = new EventSource(url, { withCredentials: true });
   * 
   * eventSource.onmessage = (event) => {
   *   const data = JSON.parse(event.data);
   *   console.log('Received notification:', data);
   * };
   * 
   * eventSource.onerror = (err) => {
   *   console.error('SSE Error:', err);
   *   eventSource.close();
   * };
   */
  getStreamUrl(): string {
    return this.rb.path('/stream').url();
  }
}
