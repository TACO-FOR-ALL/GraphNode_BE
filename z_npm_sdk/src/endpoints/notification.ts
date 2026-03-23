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
   * @deprecated
   * 실시간 알림 수신을 위한 SSE(Server-Sent Events) 스트림 URL을 반환합니다.
   *
   * 이 엔드포인트는 `text/event-stream` 형식으로 데이터를 스트리밍합니다.
   * 클라이언트는 `EventSource` API를 사용하여 연결해야 합니다.
   *
   * 참고:
   * - 이 메서드는 HTTP 요청을 수행하지 않고, 연결 가능한 URL 문자열만 반환합니다.
   * - 세션 기반 인증을 사용하므로, 브라우저의 `EventSource`가 쿠키를 전송하도록 설정해야 합니다.
   * - `since` 파라미터를 사용하여 마지막으로 받은 알림 이후의 누락된 알림을 서버로부터 재전송받을 수 있습니다.
   *
   * @param since - 마지막으로 수신한 알림의 ID (optional)
   * @returns SSE 연결을 위한 전체 URL 문자열
   * @example
   * const lastId = '01JK...';
   * const url = client.notification.getStreamUrl(lastId);
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
  getStreamUrl(since?: string): string {
    const builder = this.rb.path('/stream');
    if (since) {
      builder.query({ since });
    }
    return builder.url();
  }

  /**
   * FCM 디바이스 토큰을 등록합니다.
   * 
   * @remarks
   * 푸시 알림 수신을 위해 사용자의 디바이스 토큰을 서버에 저장합니다.
   *
   * @param token - FCM 디바이스 토큰 (string)
   * @example
   * await client.notifications.registerDeviceToken('fcm-token-xyz');
   */
  async registerDeviceToken(token: string): Promise<void> {
    await this.rb.path('/device-token').post({ token });
  }

  /**
   * FCM 디바이스 토큰을 삭제(등록 해제)합니다.
   * 
   * @remarks
   * 로그아웃 시 또는 푸시 알림 비활성화 시 사용됩니다.
   *
   * @param token - 삭제할 FCM 디바이스 토큰 (string)
   * @example
   * await client.notifications.removeDeviceToken('fcm-token-xyz');
   */
  async removeDeviceToken(token: string): Promise<void> {
    await this.rb.path('/device-token').delete({ token });
  }

}
