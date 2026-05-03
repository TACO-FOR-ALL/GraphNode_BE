import { ConversationRepositoryMongo } from '../infra/repositories/ConversationRepositoryMongo';
import { MessageRepositoryMongo } from '../infra/repositories/MessageRepositoryMongo';
import { UserRepositoryMySQL } from '../infra/repositories/UserRepositoryMySQL';
import { NoteRepositoryMongo } from '../infra/repositories/NoteRepositoryMongo';
import { GraphRepositoryMongo } from '../infra/repositories/GraphRepositoryMongo';
import { DailyUsageRepositoryPrisma } from '../infra/repositories/DailyUsageRepositoryPrisma';
import { GraphVectorService } from '../core/services/GraphVectorService';
import { ConversationService } from '../core/services/ConversationService';
import { MessageService } from '../core/services/MessageService';
import { ChatManagementService } from '../core/services/ChatManagementService';
import { UserService } from '../core/services/UserService';
import { DailyUsageService } from '../core/services/DailyUsageService';
import { NoteService } from '../core/services/NoteService';
import { GraphManagementService } from '../core/services/GraphManagementService';
import { GraphEmbeddingService } from '../core/services/GraphEmbeddingService';
import { GraphGenerationService } from '../core/services/GraphGenerationService';
import { SyncService } from '../core/services/SyncService';
import { NotificationService } from '../core/services/NotificationService';
import { AiInteractionService } from '../core/services/AiInteractionService';
import { AgentService } from '../core/services/AgentService';
import { SearchService } from '../core/services/SearchService';
import { FeedbackService } from '../core/services/FeedbackService';
import { ChatExportService } from '../core/services/ChatExportService';
import { GoogleOAuthService } from '../core/services/GoogleOAuthService';
import { AppleOAuthService } from '../core/services/AppleOAuthService';
import { MicroscopeManagementService } from '../core/services/MicroscopeManagementService';
import { createAuditProxy } from '../shared/audit/auditProxy';
import { loadEnv } from '../config/env';
// Interfaces
import { ConversationRepository } from '../core/ports/ConversationRepository';
import { MessageRepository } from '../core/ports/MessageRepository';
import { UserRepository } from '../core/ports/UserRepository';
import { DailyUsageRepository } from '../core/ports/DailyUsageRepository';
import { MicroscopeWorkspaceStore } from '../core/ports/MicroscopeWorkspaceStore';
import { MicroscopeWorkspaceRepositoryMongo } from '../infra/repositories/MicroscopeWorkspaceRepositoryMongo';
import { NotificationRepositoryMongo } from '../infra/repositories/NotificationRepositoryMongo';
// DB / Infrastructure Adapters
import { Neo4jGraphAdapter } from '../infra/graph/Neo4jGraphAdapter';
import { Neo4jMacroGraphAdapter } from '../infra/graph/Neo4jMacroGraphAdapter';
import { DualWriteGraphStoreProxy } from '../infra/graph/DualWriteGraphStoreProxy';
import { ChromaVectorAdapter } from '../infra/vector/ChromaVectorAdapter';
// import { QdrantClientAdapter } from '../infra/repositories/QdrantClientAdapter'; // Removed
import { NoteRepository } from '../core/ports/NoteRepository';
// Ports
import { GraphDocumentStore } from '../core/ports/GraphDocumentStore';
import { GraphNeo4jStore } from '../core/ports/GraphNeo4jStore';
import { MacroGraphStore } from '../core/ports/MacroGraphStore';
import { VectorStore } from '../core/ports/VectorStore';
import { QueuePort } from '../core/ports/QueuePort';
import { StoragePort } from '../core/ports/StoragePort';
import { EventBusPort } from '../core/ports/EventBusPort';
import { EmailPort } from '../core/ports/EmailPort';
import { NotificationRepository } from '../core/ports/NotificationRepository';
import { ChatExportRepository } from '../core/ports/ChatExportRepository';
import { FeedbackRepository } from '../core/ports/FeedbackRepository';
// Infra Adapters
import { AwsS3Adapter } from '../infra/aws/AwsS3Adapter';
import { AwsSqsAdapter } from '../infra/aws/AwsSqsAdapter';
import { SmtpEmailAdapter } from '../infra/email/SmtpEmailAdapter';
import { RedisEventBusAdapter } from '../infra/redis/RedisEventBusAdapter';
import { FeedbackRepositoryPrisma } from '../infra/repositories/FeedbackRepositoryPrisma';
import { ChatExportRepositoryMongo } from '../infra/repositories/ChatExportRepositoryMongo';

/**
 * 애플리케이션의 의존성 주입(Dependency Injection)을 관리하는 싱글톤 컨테이너입니다.
 *
 * 책임:
 * - Repository, Service 등 주요 객체의 인스턴스를 생성하고 관리합니다.
 * - 싱글톤 패턴을 사용하여 애플리케이션 전체에서 동일한 인스턴스를 공유하도록 보장합니다.
 * - 객체 간의 의존성을 조립(Wiring)하여 순환 참조 문제를 해결하고 결합도를 낮춥니다.
 * - 필요한 시점에 인스턴스를 생성하는 지연 로딩(Lazy Loading)을 지원합니다.
 */
export class Container {
  private static instance: Container;

  // Repositories
  private conversationRepo: ConversationRepository | null = null;
  private messageRepo: MessageRepository | null = null;
  private userRepo: UserRepository | null = null;
  private dailyUsageRepo: DailyUsageRepository | null = null;
  private noteRepo: NoteRepository | null = null;
  private graphRepo: GraphDocumentStore | null = null; // DualWriteGraphStoreProxy or GraphRepositoryMongo
  private macroGraphStore: MacroGraphStore | null = null;
  private neo4jStore: GraphNeo4jStore | null = null;
  private vectorStore: VectorStore | null = null;
  private graphVectorService: GraphVectorService | null = null;
  private microscopeWorkspaceRepo: MicroscopeWorkspaceStore | null = null;
  private notificationRepo: NotificationRepository | null = null;
  private feedbackRepo: FeedbackRepository | null = null;
  private chatExportRepo: ChatExportRepository | null = null;

  // Infra Adapters
  private queueAdapter: QueuePort | null = null;
  private storageAdapter: StoragePort | null = null;
  private emailAdapter: EmailPort | null = null;
  private eventBusAdapter: EventBusPort | null = null;

  // Services
  private conversationService: ConversationService | null = null;
  private messageService: MessageService | null = null;
  private chatManagementService: ChatManagementService | null = null;
  private userService: UserService | null = null;
  private dailyUsageService: DailyUsageService | null = null;
  private noteService: NoteService | null = null;
  private graphManagementService: GraphManagementService | null = null;
  private graphEmbeddingService: GraphEmbeddingService | null = null;
  private graphGenerationService: GraphGenerationService | null = null;
  private syncService: SyncService | null = null;
  private notificationService: NotificationService | null = null;
  private aiInteractionService: AiInteractionService | null = null;
  private agentService: AgentService | null = null;
  private googleOAuthService: GoogleOAuthService | null = null;
  private appleOAuthService: AppleOAuthService | null = null;
  private microscopeManagementService: MicroscopeManagementService | null = null;
  private searchService: SearchService | null = null;
  private feedbackService: FeedbackService | null = null;
  private chatExportService: ChatExportService | null = null;

  private constructor() {}

  /**
   * Container의 싱글톤 인스턴스를 반환합니다.
   * 인스턴스가 없으면 새로 생성합니다.
   * @returns Container 인스턴스
   */
  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  // --- Infra Adapters ---
  /**
   * AwsSqsAdapter 인스턴스를 반환합니다.
   * @returns AwsSqsAdapter 인스턴스
   */
  getAwsSqsAdapter(): QueuePort {
    if (!this.queueAdapter) {
      const raw = new AwsSqsAdapter();
      this.queueAdapter = createAuditProxy(raw, 'AwsSqsAdapter');
    }
    return this.queueAdapter;
  }

  // --- Infrastructure / DB ---

  /**
   * MacroGraphStore(Neo4jMacroGraphAdapter) 인스턴스를 반환합니다.
   * @returns MacroGraphStore 인스턴스
   */
  getMacroGraphStore(): MacroGraphStore {
    if (!this.macroGraphStore) {
      this.macroGraphStore = new Neo4jMacroGraphAdapter();
    }
    return this.macroGraphStore;
  }

  getGraphDocumentStore(): GraphDocumentStore {
    if (!this.graphRepo) {
      const primaryStore = new GraphRepositoryMongo();
      const env = loadEnv();
      if (env.MACRO_GRAPH_DUAL_WRITE_ENABLED) {
        this.graphRepo = new DualWriteGraphStoreProxy(primaryStore, this.getMacroGraphStore(), {
          secondaryWritesEnabled: true,
          shadowReadCompare: env.MACRO_GRAPH_SHADOW_COMPARE_ENABLED ?? false,
        });
      } else {
        this.graphRepo = primaryStore;
      }
    }
    return this.graphRepo;
  }

  getGraphNeo4jStore(): GraphNeo4jStore {
    if (!this.neo4jStore) {
      const raw = new Neo4jGraphAdapter();
      this.neo4jStore = createAuditProxy(raw, 'Neo4jGraphAdapter');
    }
    return this.neo4jStore;
  }

  getVectorStore(): VectorStore {
    if (!this.vectorStore) {
      const raw = new ChromaVectorAdapter();
      this.vectorStore = createAuditProxy(raw, 'ChromaVectorAdapter');
    }
    return this.vectorStore;
  }

  getGraphVectorService(): GraphVectorService {
    if (!this.graphVectorService) {
      const raw = new GraphVectorService(this.getVectorStore(), this.getGraphManagementService());
      this.graphVectorService = createAuditProxy(raw, 'GraphVectorService');
    }
    return this.graphVectorService;
  }

  /**
   * AwsS3Adapter 인스턴스를 반환합니다.
   * @returns AwsS3Adapter 인스턴스
   */
  getAwsS3Adapter(): StoragePort {
    if (!this.storageAdapter) {
      const raw = new AwsS3Adapter();
      this.storageAdapter = createAuditProxy(raw, 'AwsS3Adapter');
    }
    return this.storageAdapter;
  }

  /**
   * SmtpEmailAdapter 인스턴스를 반환합니다.
   * @remarks `CHAT_EXPORT_SMTP_USER` / `CHAT_EXPORT_SMTP_PASS` 미설정 시 발송은 건너뜁니다.
   */
  getEmailAdapter(): EmailPort {
    if (!this.emailAdapter) {
      const raw = new SmtpEmailAdapter();
      this.emailAdapter = createAuditProxy(raw, 'SmtpEmailAdapter');
    }
    return this.emailAdapter;
  }

  /**
   * RedisEventBusAdapter 인스턴스를 반환합니다.
   * @returns RedisEventBusAdapter 인스턴스
   */
  getRedisEventBusAdapter(): EventBusPort {
    if (!this.eventBusAdapter) {
      const raw = new RedisEventBusAdapter();
      this.eventBusAdapter = createAuditProxy(raw, 'RedisEventBusAdapter');
    }
    return this.eventBusAdapter;
  }

  // --- Repositories ---

  /**
   * ConversationRepository 인스턴스를 반환합니다.
   * @returns ConversationRepository 인스턴스
   */
  getConversationRepository(): ConversationRepository {
    if (!this.conversationRepo) {
      this.conversationRepo = new ConversationRepositoryMongo();
    }
    return this.conversationRepo;
  }

  /**
   * MessageRepository 인스턴스를 반환합니다.
   * @returns MessageRepository 인스턴스
   */
  getMessageRepository(): MessageRepository {
    if (!this.messageRepo) {
      this.messageRepo = new MessageRepositoryMongo();
    }
    return this.messageRepo;
  }

  /**
   * UserRepository 인스턴스를 반환합니다.
   * @returns UserRepository 인스턴스
   */
  getUserRepository(): UserRepository {
    if (!this.userRepo) {
      this.userRepo = new UserRepositoryMySQL();
    }
    return this.userRepo;
  }

  /**
   * DailyUsageRepository 인스턴스를 반환합니다.
   * @returns DailyUsageRepository 인스턴스
   */
  getDailyUsageRepository(): DailyUsageRepository {
    if (!this.dailyUsageRepo) {
      this.dailyUsageRepo = new DailyUsageRepositoryPrisma();
    }
    return this.dailyUsageRepo;
  }

  /**
   * NoteRepository 인스턴스를 반환합니다.
   * @returns NoteRepository 인스턴스
   */
  getNoteRepository(): NoteRepository {
    if (!this.noteRepo) {
      this.noteRepo = new NoteRepositoryMongo();
    }
    return this.noteRepo;
  }

  /**
   * GraphDocumentStore(Repository) 인스턴스를 반환합니다.
   * @returns GraphDocumentStore 인스턴스
   */
  getGraphRepository(): GraphDocumentStore {
    return this.getGraphDocumentStore(); // Alias for backward compatibility if needed, or better rename it fully.
    // Since we replaced usage in this file, we can just redirect.
  }

  /**
   * MicroscopeWorkspaceRepositoryMongo 인스턴스를 반환합니다.
   */
  getMicroscopeWorkspaceStore(): MicroscopeWorkspaceStore {
    if (!this.microscopeWorkspaceRepo) {
      this.microscopeWorkspaceRepo = new MicroscopeWorkspaceRepositoryMongo();
    }
    return this.microscopeWorkspaceRepo;
  }

  /**
   * NotificationRepository(Mongo) 인스턴스를 반환합니다.
   */
  getNotificationRepository(): NotificationRepository {
    if (!this.notificationRepo) {
      this.notificationRepo = new NotificationRepositoryMongo();
    }
    return this.notificationRepo;
  }

  getFeedbackRepository(): FeedbackRepository {
    if (!this.feedbackRepo) {
      this.feedbackRepo = new FeedbackRepositoryPrisma();
    }
    return this.feedbackRepo;
  }

  getChatExportRepository(): ChatExportRepository {
    if (!this.chatExportRepo) {
      this.chatExportRepo = new ChatExportRepositoryMongo();
    }
    return this.chatExportRepo;
  }

  // --- Services ---

  /**
   * ConversationService 인스턴스를 반환합니다.
   * @returns ConversationService 인스턴스
   */
  getConversationService(): ConversationService {
    if (!this.conversationService) {
      const raw = new ConversationService(this.getConversationRepository());
      this.conversationService = createAuditProxy(raw, 'ConversationService');
    }
    return this.conversationService;
  }

  /**
   * MessageService 인스턴스를 반환합니다.
   */
  getMessageService(): MessageService {
    if (!this.messageService) {
      const raw = new MessageService(this.getMessageRepository());
      this.messageService = createAuditProxy(raw, 'MessageService');
    }
    return this.messageService;
  }

  /**
   * ChatManagementService 인스턴스를 반환합니다.
   */
  getChatManagementService(): ChatManagementService {
    if (!this.chatManagementService) {
      const raw = new ChatManagementService(
        this.getConversationService(),
        this.getMessageService(),
        this.getGraphManagementService()
      );
      this.chatManagementService = createAuditProxy(raw, 'ChatManagementService');
    }
    return this.chatManagementService;
  }

  /**
   * UserService 인스턴스를 반환합니다.
   */
  getUserService(): UserService {
    if (!this.userService) {
      const raw = new UserService(this.getUserRepository());
      this.userService = createAuditProxy(raw, 'UserService');
    }
    return this.userService;
  }

  /**
   * DailyUsageService 인스턴스를 반환합니다.
   */
  getDailyUsageService(): DailyUsageService {
    if (!this.dailyUsageService) {
      const raw = new DailyUsageService(this.getDailyUsageRepository());
      this.dailyUsageService = createAuditProxy(raw, 'DailyUsageService');
    }
    return this.dailyUsageService;
  }

  /**
   * NoteService 인스턴스를 반환합니다.
   */
  getNoteService(): NoteService {
    if (!this.noteService) {
      const raw = new NoteService(this.getNoteRepository(), this.getGraphManagementService());
      this.noteService = createAuditProxy(raw, 'NoteService');
    }
    return this.noteService;
  }

  /**
   * GraphManagementService 인스턴스를 반환합니다.
   */
  getGraphManagementService(): GraphManagementService {
    if (!this.graphManagementService) {
      const raw = new GraphManagementService(this.getGraphDocumentStore());
      this.graphManagementService = createAuditProxy(raw, 'GraphManagementService');
    }
    return this.graphManagementService;
  }

  /**
   * GraphEmbeddingService 인스턴스를 반환합니다.
   */
  getGraphEmbeddingService(): GraphEmbeddingService {
    if (!this.graphEmbeddingService) {
      // Inject GraphManagementService (Mongo)
      const raw = new GraphEmbeddingService(
        this.getGraphManagementService(),
        this.getVectorStore(),
        this.getConversationService(),
        this.getNoteService()
      );
      this.graphEmbeddingService = createAuditProxy(raw, 'GraphEmbeddingService');
    }
    return this.graphEmbeddingService;
  }

  /**
   * GraphGenerationService 인스턴스를 반환합니다.
   */
  getGraphGenerationService(): GraphGenerationService {
    if (!this.graphGenerationService) {
      const raw = new GraphGenerationService(
        this.getChatManagementService(),
        this.getGraphEmbeddingService(),
        this.getNoteService(),
        this.getUserService(),
        this.getAwsSqsAdapter(),
        this.getAwsS3Adapter(),
        this.getNotificationService()
      );
      this.graphGenerationService = createAuditProxy(raw, 'GraphGenerationService');
    }
    return this.graphGenerationService;
  }

  /**
   * SyncService 인스턴스를 반환합니다.
   */
  getSyncService(): SyncService {
    if (!this.syncService) {
      const raw = new SyncService(
        this.getConversationService(),
        this.getMessageService(),
        this.getNoteService()
      );
      this.syncService = createAuditProxy(raw, 'SyncService');
    }
    return this.syncService;
  }

  /**NotificationService 인스턴스를 반환합니다.
   */
  getNotificationService(): NotificationService {
    if (!this.notificationService) {
      const raw = new NotificationService(
        this.getRedisEventBusAdapter(),
        this.getNotificationRepository()
      );
      this.notificationService = createAuditProxy(raw, 'NotificationService');
    }
    return this.notificationService;
  }

  /**
   * AgentService 인스턴스를 반환합니다.
   */
  getAgentService(): AgentService {
    if (!this.agentService) {
      const raw = new AgentService(
        //FIXED(강현일) : 생성자에서 직접 주입받는걸로 변경
        {
          userService: this.getUserService(),
          noteService: this.getNoteService(),
          conversationService: this.getConversationService(),
          messageService: this.getMessageService(),
          graphEmbeddingService: this.getGraphEmbeddingService(),
          graphVectorService: this.getGraphVectorService(),
          searchService: this.getSearchService(),
        }
      );
      this.agentService = createAuditProxy(raw, 'AgentService');
    }
    return this.agentService;
  }

  /**
   * AiInteractionService 인스턴스를 반환합니다.
   */
  getAiInteractionService(): AiInteractionService {
    if (!this.aiInteractionService) {
      const raw = new AiInteractionService(
        this.getChatManagementService(),
        this.getUserService(),
        this.getAwsS3Adapter()
      );
      this.aiInteractionService = createAuditProxy(raw, 'AiInteractionService');
    }
    return this.aiInteractionService;
  }

  getChatExportService(): ChatExportService {
    if (!this.chatExportService) {
      const raw = new ChatExportService(
        this.getChatManagementService(),
        this.getUserService(),
        this.getChatExportRepository(),
        this.getAwsS3Adapter(),
        this.getEmailAdapter()
      );
      this.chatExportService = createAuditProxy(raw, 'ChatExportService');
    }
    return this.chatExportService;
  }

  /**
   * GoogleOAuthService 인스턴스를 반환합니다.
   */
  getGoogleOAuthService(): GoogleOAuthService {
    if (!this.googleOAuthService) {
      const env = loadEnv();
      const raw = new GoogleOAuthService({
        clientId: env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
        redirectUri: env.OAUTH_GOOGLE_REDIRECT_URI,
      });
      this.googleOAuthService = createAuditProxy(raw, 'GoogleOAuthService');
    }
    return this.googleOAuthService;
  }

  /**
   * AppleOAuthService 인스턴스를 반환합니다.
   */
  getAppleOAuthService(): AppleOAuthService {
    if (!this.appleOAuthService) {
      const env = loadEnv();
      const raw = new AppleOAuthService({
        clientId: env.OAUTH_APPLE_CLIENT_ID,
        teamId: env.OAUTH_APPLE_TEAM_ID,
        keyId: env.OAUTH_APPLE_KEY_ID,
        privateKey: env.OAUTH_APPLE_PRIVATE_KEY,
        redirectUri: env.OAUTH_APPLE_REDIRECT_URI,
      });
      this.appleOAuthService = createAuditProxy(raw, 'AppleOAuthService');
    }
    return this.appleOAuthService;
  }

  /**
   * MicroscopeManagementService 인스턴스를 반환합니다.
   */
  getMicroscopeManagementService(): MicroscopeManagementService {
    if (!this.microscopeManagementService) {
      const raw = new MicroscopeManagementService(
        this.getMicroscopeWorkspaceStore(),
        this.getGraphNeo4jStore(),
        this.getAwsSqsAdapter(),
        this.getAwsS3Adapter(),
        this.getConversationRepository(),
        this.getNoteRepository(),
        this.getNotificationService(),
        this.getUserService()
      );
      this.microscopeManagementService = createAuditProxy(raw, 'MicroscopeManagementService');
    }
    return this.microscopeManagementService;
  }

  /**
   * SearchService 인스턴스를 반환합니다.
   */
  getSearchService(): SearchService {
    if (!this.searchService) {
      const raw = new SearchService(
        this.getConversationRepository(),
        this.getNoteRepository(),
        this.getMessageRepository(),
        this.getGraphVectorService(),
        this.getMacroGraphStore(),
      );
      this.searchService = createAuditProxy(raw, 'SearchService');
    }
    return this.searchService;
  }

  getFeedbackService(): FeedbackService {
    if (!this.feedbackService) {
      const raw = new FeedbackService(this.getFeedbackRepository(), this.getAwsS3Adapter());
      this.feedbackService = createAuditProxy(raw, 'FeedbackService');
    }
    return this.feedbackService;
  }
}

export const container = Container.getInstance();
