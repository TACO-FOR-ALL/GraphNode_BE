import { createRequestBuilder, type BuilderOptions, RequestBuilder } from './http-builder.js';
import { GRAPHNODE_BASE_URL } from './config.js';
import { HealthApi } from './endpoints/health.js';
import { MeApi } from './endpoints/me.js';
import { ConversationsApi } from './endpoints/conversations.js';
import { GoogleAuthApi } from './endpoints/auth.google.js';
import { GraphApi } from './endpoints/graph.js';
import { NoteApi } from './endpoints/note.js';
import { AppleAuthApi } from './endpoints/auth.apple.js';
import { SyncApi } from './endpoints/sync.js';
import { AiApi } from './endpoints/ai.js';

/**
 * GraphNode 클라이언트 옵션
 * @public
 * @property fetch 커스텀 fetch 함수 (선택)
 * @property headers 기본 헤더 (선택)
 * @property credentials 인증 모드 (include | omit | same-origin)
 */
export interface GraphNodeClientOptions extends Omit<BuilderOptions, 'baseUrl'> {}

/**
 * GraphNode API 클라이언트
 * @public
 * @property health 헬스 체크 API
 * @property me 내 정보 관리 API
 * @property conversations 대화 관리 API
 * @property googleAuth 구글 인증 API
 * @property graph 그래프 관리 API
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
  readonly note: NoteApi;
  readonly appleAuth: AppleAuthApi;
  readonly sync: SyncApi;
  readonly ai: AiApi;
  private readonly rb: RequestBuilder;

  constructor(opts: GraphNodeClientOptions = {}) {
    let fetchFn = opts.fetch;

    if (!fetchFn) {
      if (typeof window !== 'undefined' && window.fetch) {
        // 1. 브라우저 / Electron Renderer 환경
        // window.fetch를 그냥 넘기면 'Illegal invocation' 발생하므로 bind 처리
        fetchFn = window.fetch.bind(window);
      } else if (typeof globalThis !== 'undefined' && (globalThis as any).fetch) {
        // 2. Node.js (v18+) / 기타 환경
        fetchFn = (globalThis as any).fetch.bind(globalThis);
      }
    }

    // 내부 고정 baseUrl 사용, FE는 fetch/headers/credentials 정도만 선택 주입 가능
    this.rb = createRequestBuilder({ 
      baseUrl: GRAPHNODE_BASE_URL, 
      ...opts,
      fetch: fetchFn // 바인딩된 fetch 주입
    });
    this.health = new HealthApi(this.rb);
    this.me = new MeApi(this.rb);
    this.conversations = new ConversationsApi(this.rb);
    this.googleAuth = new GoogleAuthApi(GRAPHNODE_BASE_URL);
    this.graph = new GraphApi(this.rb);
    this.note = new NoteApi(this.rb);
    this.appleAuth = new AppleAuthApi(GRAPHNODE_BASE_URL);
    this.sync = new SyncApi(this.rb);
    this.ai = new AiApi(this.rb);
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

