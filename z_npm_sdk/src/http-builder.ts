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
  credentials?: RequestCredentials; // default 'include'
}

export class HttpError<TBody = unknown> extends Error {
  status: number;
  body?: TBody;
  constructor(message: string, status: number, body?: TBody) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export interface HttpResponse<T> {
  statusCode: number;
  data: T;
}

export class RequestBuilder {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly credentials: RequestCredentials;
  private readonly segments: string[];
  private readonly queryParams: URLSearchParams;

  constructor(opts: BuilderOptions, segments: string[] = [], query?: URLSearchParams) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike);
    this.headers = { Accept: 'application/json', ...(opts.defaultHeaders ?? {}) };
    this.credentials = opts.credentials ?? 'include';
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

  private url(): string {
    const path = this.segments.length ? '/' + this.segments.map(encodeURIComponent).join('/') : '';
    const qs = this.queryParams.toString();
    return this.baseUrl + path + (qs ? `?${qs}` : '');
  }

  private async send<T>(method: string, body?: unknown): Promise<HttpResponse<T>> {
    const headers = { ...this.headers } as Record<string, string>;
    const init: RequestInit = { method, headers, credentials: this.credentials };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(this.url(), init);
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
      throw new HttpError(`HTTP ${res.status}: ${res.statusText}`, res.status, payload);
    }
    return {
      statusCode: res.status,
      data: payload as T,
    };
  }
}

/**
 * 외부에서 사용: createRequestBuilder({ baseUrl }).path('/v1/me').get()
 */
export function createRequestBuilder(opts: BuilderOptions): RequestBuilder {
  return new RequestBuilder(opts);
}
