/**
 * GoogleAuthApi: 브라우저 리다이렉트 기반 OAuth 시작 URL 헬퍼.
 * 실제 콜백 처리는 서버가 수행하므로 SDK는 start URL 생성만 제공.
 */
export class GoogleAuthApi {
  constructor(private baseUrl: string) {}

  /** 로그인 시작 URL 생성 */
  startUrl(): string {
    return this.baseUrl.replace(/\/$/, '') + '/auth/google/start';
  }
}
