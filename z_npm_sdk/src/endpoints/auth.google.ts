/**
 * GoogleAuthApi: 브라우저 리다이렉트 기반 OAuth 시작 URL 헬퍼.
 * 실제 콜백 처리는 서버가 수행하므로 SDK는 start URL 생성만 제공.
 * @public
 */
export class GoogleAuthApi {
  constructor(private baseUrl: string) {}

  /**
   * 로그인 시작 URL을 반환합니다.
   * @returns Google OAuth 시작 URL
   * @example
   * const url = client.googleAuth.startUrl();
   * console.log(url);
   * // Output:
   * // 'https://api.graphnode.dev/auth/google/start'
   */
  startUrl(): string {
    return this.baseUrl.replace(/\/$/, '') + '/auth/google/start';
  }

  /**
   * 브라우저를 Google 로그인 페이지로 리다이렉트합니다.
   * @param windowObj window 객체 (테스트/SSR 대응, 기본값 window)
   * @example
   * // In a browser environment:
   * client.googleAuth.login();
   */
  login(windowObj: Window = window): void {
    windowObj.location.href = this.startUrl();
  }
}
