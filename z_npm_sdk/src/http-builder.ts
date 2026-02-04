/**
 * HTTP Request Builder (fluent)
 * - baseUrl을 내부에 보관하고, 외부에서는 경로(path)만 넘겨 호출할 수 있게 한다.
 * - 기본적으로 credentials: 'include' 로 세션 쿠키를 전송한다.
 */

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BuilderOptions {
  baseUrl: string; // e.g., https://api.example.com
  fetch?: FetchLike; // Node<18 환경 등에서 주입 가능
  defaultHeaders?: Record<string, string>;
  credentials?: RequestCredentials; // default 'include'HttpError
  accessToken?: string | (() => string | null);
}

// export class HttpError<TBody = unknown> extends Error {
//   status: number;
//   body?: TBody;
//   constructor(message: string, status: number, body?: TBody) {
//     super(message);
//     this.name = 'HttpError';
//     this.status = status;
//     this.body = body;
//   }
// }

export type HttpResponseSuccess<T> = {
  isSuccess: true;
  data: T;
  statusCode: number;
};

export type HttpResponseError = {
  isSuccess: false;
  error: {
    statusCode: number;
    message: string;
    body?: unknown;
  };
};

export type HttpResponse<T> = HttpResponseSuccess<T> | HttpResponseError;

export class RequestBuilder {
  /**
   * API 기본 URL (마지막 슬래시 제거됨)
   * @private
   */
  private readonly baseUrl: string;

  /**
   * 실제 HTTP 요청을 수행할 fetch 함수 구현체
   * @private
   */
  private readonly fetchImpl: FetchLike;

  /**
   * 모든 요청에 포함될 기본 HTTP 헤더 (예: Accept: application/json)
   * @private
   */
  private readonly headers: Record<string, string>;

  /**
   * 자격 증명(쿠키) 전송 모드 ('include' | 'omit' | 'same-origin')
   * - 'include'로 설정 시 브라우저가 자동으로 쿠키를 전송합니다.
   * @private
   */
  private readonly credentials: RequestCredentials;

  /**
   * Access Token을 동적으로 반환하는 함수 또는 정적 문자열.
   * - 함수로 설정된 경우 요청 시점의 최신 토큰을 조회하여 Authorization 헤더에 사용합니다.
   * - 값이 없으면(undefined) Authorization 헤더를 추가하지 않습니다 (쿠키 인증 의존).
   * @private
   */
  private readonly accessToken?: string | (() => string | null);

  /**
   * 현재 빌더가 가지고 있는 URL 경로 조각들
   * @private
   */
  private readonly segments: string[];

  /**
   * 현재 빌더가 가지고 있는 쿼리 파라미터들
   * @private
   */
  private readonly queryParams: URLSearchParams;

  /**
   * RequestBuilder 생성자
   * @param opts 빌더 공통 옵션 (baseUrl, fetch, headers 등)
   * @param segments 초기 URL 경로 조각 리스트
   * @param query 초기 쿼리 파라미터
   */
  constructor(opts: BuilderOptions, segments: string[] = [], query?: URLSearchParams) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike);
    this.headers = { Accept: 'application/json', ...(opts.defaultHeaders ?? {}) };
    this.credentials = opts.credentials ?? 'include';
    this.accessToken = opts.accessToken;
    this.segments = segments;
    this.queryParams = query ?? new URLSearchParams();
  }

  /**
   * 경로 조각을 추가한다. '/v1/me' 같은 절대 경로도 허용한다.
   * @internal SDK 내부에서만 사용된다. FE에서는 직접 호출하지 말 것.
   */
  path(p: string): RequestBuilder {
    if (!p) return this;
    if (p.startsWith('http://') || p.startsWith('https://')) {
      // 절대 URL을 넣으면 baseUrl을 무시하고 해당 URL 전체를 하나의 세그먼트로 취급
      return new RequestBuilder(
        {
          baseUrl: p,
          fetch: this.fetchImpl,
          defaultHeaders: this.headers,
          credentials: this.credentials,
          accessToken: this.accessToken,
        },
        [],
        new URLSearchParams(this.queryParams)
      );
    }
    const segs = p.split('/').filter(Boolean);
    return new RequestBuilder(
      {
        baseUrl: this.baseUrl,
        fetch: this.fetchImpl,
        defaultHeaders: this.headers,
        credentials: this.credentials,
      },
      [...this.segments, ...segs],
      new URLSearchParams(this.queryParams)
    );
  }

  /**
   * 쿼리 파라미터를 추가한다.
   * @internal SDK 내부에서만 사용된다. FE에서는 직접 호출하지 말 것.
   */
  query(params?: Record<string, unknown>): RequestBuilder {
    if (!params) return this;
    const q = new URLSearchParams(this.queryParams);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      q.set(k, String(v));
    }
    return new RequestBuilder(
      {
        baseUrl: this.baseUrl,
        fetch: this.fetchImpl,
        defaultHeaders: this.headers,
        credentials: this.credentials,
      },
      [...this.segments],
      q
    );
  }

  async get<T>(): Promise<HttpResponse<T>> {
    return this.send<T>('GET');
  }

  async post<T>(body?: unknown): Promise<HttpResponse<T>> {
    return this.send<T>('POST', body);
  }

  async patch<T>(body?: unknown): Promise<HttpResponse<T>> {
    return this.send<T>('PATCH', body);
  }

  async delete<T>(body?: unknown): Promise<HttpResponse<T>> {
    return this.send<T>('DELETE', body);
  }

  public url(): string {
    const path = this.segments.length ? '/' + this.segments.map(encodeURIComponent).join('/') : '';
    const qs = this.queryParams.toString();
    return this.baseUrl + path + (qs ? `?${qs}` : '');
  }

  public async sendRaw(
    method: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers = { ...this.headers, ...extraHeaders } as Record<string, string>;

    // Access Token 주입
    if (this.accessToken) {
      const token = typeof this.accessToken === 'function' ? this.accessToken() : this.accessToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const init: RequestInit = { method, headers, credentials: this.credentials };
    if (body !== undefined) {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        init.body = body;
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }

    const makeRequest = async () => this.fetchImpl(this.url(), init);
    let res = await makeRequest();

    // 401 Unauthorized 발생 시 Refresh Token으로 갱신 시도
    if (res.status === 401) {
      try {
        // Refresh API 호출 (http-builder 내부 로직 재사용 방지 위해 fetchImpl 직접 사용)
        const refreshUrl = `${this.baseUrl}/auth/refresh`;
        const refreshRes = await this.fetchImpl(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // 쿠키 전송 필수
        });

        if (refreshRes.ok) {
          // 갱신 성공 시, 원래 요청 재시도
          // (브라우저가 새 Access Token 쿠키를 자동으로 저장했으므로, 재요청 시 새 토큰이 나감)
          res = await makeRequest();
        }
      } catch (e) {
        // Refresh 실패 시, 원래의 401 응답을 그대로 반환 (또는 로깅)
        console.error('Auto-refresh failed:', e);
      }
    }

    return res;
  }

  private async send<T>(method: string, body?: unknown): Promise<HttpResponse<T>> {
    try {
      const res = await this.sendRaw(method, body);
      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json') || ct.includes('application/problem+json');

      const isNoContent =
        res.status === 204 || res.status === 205 || res.headers.get('content-length') === '0';

      let payload: unknown = undefined;

      if (!isNoContent) {
        if (isJson) {
          payload = await res.json();
        } else {
          payload = await res.text();
        }
      }

      if (!res.ok) {
        return {
          isSuccess: false,
          error: {
            statusCode: res.status,
            message: `HTTP ${res.status}: ${res.statusText}`,
            body: payload,
          },
        };
      }
      return {
        isSuccess: true,
        statusCode: res.status,
        data: payload as T,
      };
    } catch (e) {
      const err = e as Error;
      return {
        isSuccess: false,
        error: {
          statusCode: 0,
          message: err.message,
        },
      };
    }
  }
}

/**
 * 외부에서 사용: createRequestBuilder({ baseUrl }).path('/v1/me').get()
 */
export function createRequestBuilder(opts: BuilderOptions): RequestBuilder {
  return new RequestBuilder(opts);
}
