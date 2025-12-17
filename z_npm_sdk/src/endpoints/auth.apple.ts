/**
 * Apple Auth API
 * 
 * Apple OAuth 인증을 위한 헬퍼 클래스입니다.
 * `/auth/apple` 관련 엔드포인트 URL을 생성하거나 리다이렉트를 수행합니다.
 * 
 * 주요 기능:
 * - 로그인 시작 URL 생성 (`startUrl`)
 * - 로그인 페이지로 리다이렉트 (`login`)
 * 
 * @public
 */
export class AppleAuthApi {
  constructor(private baseUrl: string) {}

  /**
   * 로그인 시작 URL을 반환합니다.
   * @returns Apple OAuth 시작 URL
   * @example
   * const url = client.appleAuth.startUrl();
   * console.log(url);
   * // Output:
   * // 'https://api.graphnode.dev/auth/apple/start'
   */
  startUrl(): string {
    return this.baseUrl.replace(/\/$/, '') + '/auth/apple/start';
  }

  /**
   * 브라우저를 Apple 로그인 페이지로 리다이렉트합니다.
   * @param windowObj window 객체 (테스트/SSR 대응, 기본값 window)
   * @example
   * // In a browser environment:
   * client.appleAuth.login();
   */
  login(windowObj: Window = window): void {
    windowObj.location.href = this.startUrl();
  }
}
