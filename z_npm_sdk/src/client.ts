import { createRequestBuilder, type BuilderOptions, RequestBuilder } from './http-builder.js';
import { getGraphNodeBaseUrl } from './config.js';
import { HealthApi } from './endpoints/health.js';
import { MeApi } from './endpoints/me.js';
import { ConversationsApi } from './endpoints/conversations.js';
import { GoogleAuthApi } from './endpoints/auth.google.js';
import { GraphApi } from './endpoints/graph.js';
import { GraphAiApi } from './endpoints/graphAi.js';
import { NoteApi } from './endpoints/note.js';
import { AppleAuthApi } from './endpoints/auth.apple.js';
import { SyncApi } from './endpoints/sync.js';
import { AiApi } from './endpoints/ai.js';
import  { NotificationApi } from './endpoints/notification.js';
import { FileApi } from './endpoints/file.js';

/**
 * GraphNode 클라이언트 옵션
 * @public
 * @property fetch 커스텀 fetch 함수 (선택)
 * @property headers 기본 헤더 (선택)
 * @property credentials 인증 모드 (include | omit | same-origin)
 * @property accessToken 초기 Access Token (선택)
 */
export interface GraphNodeClientOptions extends Omit<BuilderOptions, 'baseUrl' | 'accessToken'> {
  accessToken?: string | null;
}

/**
 * GraphNode API 클라이언트
 * @public
 * @property health 헬스 체크 API
 * @property me 내 정보 관리 API
 * @property conversations 대화 관리 API
 * @property googleAuth 구글 인증 API
 * @property graph 그래프 관리 API
 * @property graphAi 그래프 AI 생성 API
 * @property note 노트/폴더 관리 API
 * @property appleAuth 애플 인증 API
 * @property sync 데이터 동기화 API
 * @property ai AI 채팅 API
 */
export class GraphNodeClient {
  readonly health: HealthApi;
  readonly me: MeApi;
  readonly conversations: ConversationsApi;
  readonly googleAuth: GoogleAuthApi;
  readonly graph: GraphApi;
  readonly graphAi: GraphAiApi;
  readonly note: NoteApi;
  readonly appleAuth: AppleAuthApi;
  readonly sync: SyncApi;
  readonly ai: AiApi;
  readonly notification: NotificationApi;
  readonly file: FileApi;

  /**
   * HTTP 요청 빌더 인스턴스.
   * 모든 API 엔드포인트가 이 빌더를 공유하여 HTTP 요청을 수행합니다.
   * @private
   */
  private readonly rb: RequestBuilder;

  /**
   * 현재 설정된 Access Token (Bearer 토큰).
   * 쿠키 인증 방식을 사용할 경우 null일 수 있습니다.
   * @private
   */
  private _accessToken: string | null = null;

  /**
   * GraphNodeClient 생성자.
   * - 실행 환경(브라우저/Node.js)에 맞는 fetch 함수를 자동으로 감지하여 설정합니다.
   * - 기본 API URL 및 공통 헤더 등 통신 옵션을 초기화합니다.
   * 
   * @param opts 클라이언트 설정 옵션
   */
  constructor(opts: GraphNodeClientOptions = {}) {
    // 1. fetch 함수 결정 전략
    // 사용자가 opts.fetch로 직접 주입하지 않은 경우, 환경에 따라 적절한 기본 fetch를 찾습니다.
    let fetchFn = opts.fetch;

    if (!fetchFn) {
      if (typeof window !== 'undefined' && window.fetch) {
        // [Browser / Electron Renderer 환경]
        // window.fetch는 호출 시 'this'가 window여야 하므로 bind(window)가 필수입니다.
        // 그냥 할당하면 "Illegal invocation" 에러가 발생할 수 있습니다.
        fetchFn = window.fetch.bind(window);
      } else if (typeof globalThis !== 'undefined' && (globalThis as any).fetch) {
        // [Node.js 18+ / Bun / Deno 등 환경]
        // 전역 스코프(globalThis)에 있는 fetch를 사용합니다.
        fetchFn = (globalThis as any).fetch.bind(globalThis);
      }
    }

    this._accessToken = opts.accessToken ?? null;

    // 2. RequestBuilder 초기화
    // createRequestBuilder를 통해 내부적으로 사용할 HTTP 요청 처리기를 만듭니다.
    // 여기서 accessToken을 '함수' 형태로 넘기는 이유는,
    // 나중에 setAccessToken()으로 값이 바뀌었을 때, RequestBuilder가 최신 값을 참조할 수 있게 하기 위함입니다.
    this.rb = createRequestBuilder({
      baseUrl: getGraphNodeBaseUrl(),
      ...opts,
      fetch: fetchFn, // 결정된 fetch 함수 주입
      accessToken: () => this._accessToken, // [중요] 동적 토큰 참조를 위한 Getter 함수 전달
    });

    // 3. 각 API 모듈 초기화
    // 각 모듈은 공유된 RequestBuilder(this.rb)를 사용하여 통신합니다.
    this.health = new HealthApi(this.rb);
    this.me = new MeApi(this.rb);
    this.conversations = new ConversationsApi(this.rb);
    this.googleAuth = new GoogleAuthApi(getGraphNodeBaseUrl());
    this.graph = new GraphApi(this.rb);
    this.graphAi = new GraphAiApi(this.rb);
    this.note = new NoteApi(this.rb);
    this.appleAuth = new AppleAuthApi(getGraphNodeBaseUrl());
    this.sync = new SyncApi(this.rb);
    this.ai = new AiApi(this.rb);
    this.notification = new NotificationApi(this.rb); 
    this.file = new FileApi(this.rb);
  }

  /**
   * Access Token을 동적으로 설정합니다.
   * - 로그인 후 발급받은 토큰을 수동으로 설정하거나, 로그아웃 시 null로 초기화할 때 사용합니다.
   * - 쿠키 기반 인증을 사용하는 경우, 이 함수를 호출하지 않아도(null 상태여도) 정상 동작합니다.
   * 
   * @param token JWT Access Token 문자열 또는 null (초기화)
   */
  setAccessToken(token: string | null) {
    this._accessToken = token;
  }
}

/**
 * GraphNode 클라이언트 인스턴스를 생성합니다.
 * @param opts 클라이언트 옵션
 * @returns GraphNodeClient 인스턴스
 */
export function createGraphNodeClient(opts?: GraphNodeClientOptions): GraphNodeClient {
  return new GraphNodeClient(opts);
}
