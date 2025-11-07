import { createRequestBuilder, type BuilderOptions, RequestBuilder } from './http-builder.js';
import { GRAPHNODE_BASE_URL } from './config.js';
import { HealthApi } from './endpoints/health.js';
import { MeApi } from './endpoints/me.js';
import { ConversationsApi } from './endpoints/conversations.js';
import { GoogleAuthApi } from './endpoints/auth.google.js';
import { GraphApi } from './endpoints/graph.js';

// FE에서는 baseUrl을 전달할 수 없도록, 옵션에서 baseUrl 제거
export interface GraphNodeClientOptions extends Omit<BuilderOptions, 'baseUrl'> {}

export class GraphNodeClient {
  readonly health: HealthApi;
  readonly me: MeApi;
  readonly conversations: ConversationsApi;
  readonly googleAuth: GoogleAuthApi;
  readonly graph: GraphApi;
  private readonly rb: RequestBuilder;

  constructor(opts: GraphNodeClientOptions = {}) {
    // 내부 고정 baseUrl 사용, FE는 fetch/headers/credentials 정도만 선택 주입 가능
    this.rb = createRequestBuilder({ baseUrl: GRAPHNODE_BASE_URL, ...opts });
    this.health = new HealthApi(this.rb);
    this.me = new MeApi(this.rb);
    this.conversations = new ConversationsApi(this.rb);
    this.googleAuth = new GoogleAuthApi(GRAPHNODE_BASE_URL);
    this.graph = new GraphApi(this.rb);
  }
}

export function createGraphNodeClient(opts?: GraphNodeClientOptions): GraphNodeClient {
  return new GraphNodeClient(opts);
}
