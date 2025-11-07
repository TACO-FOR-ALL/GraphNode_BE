import { createRequestBuilder, type BuilderOptions, RequestBuilder } from './http-builder.js';
import { HealthApi } from './endpoints/health.js';
import { MeApi } from './endpoints/me.js';
import { ConversationsApi } from './endpoints/conversations.js';
import { GoogleAuthApi } from './endpoints/auth.google.js';
import { GraphApi } from './endpoints/graph.js';

export interface GraphNodeClientOptions extends BuilderOptions {}

export class GraphNodeClient {
  readonly health: HealthApi;
  readonly me: MeApi;
  readonly conversations: ConversationsApi;
  readonly googleAuth: GoogleAuthApi;
  readonly graph: GraphApi;
  private readonly rb: RequestBuilder;

  constructor(opts: GraphNodeClientOptions) {
    this.rb = createRequestBuilder(opts);
    this.health = new HealthApi(this.rb);
    this.me = new MeApi(this.rb);
    this.conversations = new ConversationsApi(this.rb);
    this.googleAuth = new GoogleAuthApi(opts.baseUrl.replace(/\/$/, ''));
    this.graph = new GraphApi(this.rb);
  }
}

export function createGraphNodeClient(opts: GraphNodeClientOptions): GraphNodeClient {
  return new GraphNodeClient(opts);
}
