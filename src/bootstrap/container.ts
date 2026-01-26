import { ConversationRepositoryMongo } from '../infra/repositories/ConversationRepositoryMongo';
import { MessageRepositoryMongo } from '../infra/repositories/MessageRepositoryMongo';
import { UserRepositoryMySQL } from '../infra/repositories/UserRepositoryMySQL';
import { NoteRepositoryMongo } from '../infra/repositories/NoteRepositoryMongo';
import { GraphRepositoryMongo } from '../infra/repositories/GraphRepositoryMongo';
import { ConversationService } from '../core/services/ConversationService';
import { MessageService } from '../core/services/MessageService';
import { ChatManagementService } from '../core/services/ChatManagementService';
import { UserService } from '../core/services/UserService';
import { NoteService } from '../core/services/NoteService';
import { GraphManagementService } from '../core/services/GraphManagementService';
import { GraphEmbeddingService } from '../core/services/GraphEmbeddingService';
import { GraphGenerationService } from '../core/services/GraphGenerationService';
import { SyncService } from '../core/services/SyncService';
import { NotificationService } from '../core/services/NotificationService';
import { AiInteractionService } from '../core/services/AiInteractionService';
import { GoogleOAuthService } from '../core/services/GoogleOAuthService';
import { AppleOAuthService } from '../core/services/AppleOAuthService';
import { createAuditProxy } from '../shared/audit/auditProxy';
import { loadEnv } from '../config/env';
// Interfaces
import { ConversationRepository } from '../core/ports/ConversationRepository';
import { MessageRepository } from '../core/ports/MessageRepository';
import { UserRepository } from '../core/ports/UserRepository';
// DB / Infrastructure Adapters
// import { Neo4jGraphAdapter } from '../infra/graph/Neo4jGraphAdapter';
import { ChromaVectorAdapter } from '../infra/vector/ChromaVectorAdapter';
// import { QdrantClientAdapter } from '../infra/repositories/QdrantClientAdapter'; // Removed
import { NoteRepository } from '../core/ports/NoteRepository';
// Ports
import { GraphDocumentStore } from '../core/ports/GraphDocumentStore';
import { GraphNeo4jStore } from '../core/ports/GraphNeo4jStore';
import { VectorStore } from '../core/ports/VectorStore';
import { QueuePort } from '../core/ports/QueuePort';
import { StoragePort } from '../core/ports/StoragePort';
import { EventBusPort } from '../core/ports/EventBusPort';
// Infra Adapters
import { AwsSqsAdapter } from '../infra/aws/AwsSqsAdapter';
import { AwsS3Adapter } from '../infra/aws/AwsS3Adapter';
import { RedisEventBusAdapter } from '../infra/redis/RedisEventBusAdapter';

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
  private noteRepo: NoteRepository | null = null;
  private graphRepo: GraphDocumentStore | null = null; // Renamed to Mongo Store
  private neo4jStore: GraphNeo4jStore | null = null; // Added
  private vectorStore: VectorStore | null = null; // Added

  // Infra Adapters
  private queueAdapter: QueuePort | null = null;
  private storageAdapter: StoragePort | null = null;
  private eventBusAdapter: EventBusPort | null = null;

  // Services
  private conversationService: ConversationService | null = null;
  private messageService: MessageService | null = null;
  private chatManagementService: ChatManagementService | null = null;
  private userService: UserService | null = null;
  private noteService: NoteService | null = null;
  private graphManagementService: GraphManagementService | null = null;
  private graphEmbeddingService: GraphEmbeddingService | null = null;
  private graphGenerationService: GraphGenerationService | null = null;
  private syncService: SyncService | null = null;
  private notificationService: NotificationService | null = null;
  private aiInteractionService: AiInteractionService | null = null;
  private googleOAuthService: GoogleOAuthService | null = null;
  private appleOAuthService: AppleOAuthService | null = null;

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
      this.queueAdapter = new AwsSqsAdapter();
    }
    return this.queueAdapter;
  }

  // --- Infrastructure / DB ---

  getGraphDocumentStore(): GraphDocumentStore {
    if (!this.graphRepo) {
      this.graphRepo = new GraphRepositoryMongo();
    }
    return this.graphRepo;
  }

  // getGraphNeo4jStore(): GraphNeo4jStore {
  //     if (!this.neo4jStore) {
  //         this.neo4jStore = new Neo4jGraphAdapter();
  //     }
  //     return this.neo4jStore;
  // }

  getVectorStore(): VectorStore {
    if (!this.vectorStore) {
      this.vectorStore = new ChromaVectorAdapter();
    }
    return this.vectorStore;
  }

  /**
   * AwsS3Adapter 인스턴스를 반환합니다.
   * @returns AwsS3Adapter 인스턴스
   */
  getAwsS3Adapter(): StoragePort {
    if (!this.storageAdapter) {
      this.storageAdapter = new AwsS3Adapter();
    }
    return this.storageAdapter;
  }

  /**
   * RedisEventBusAdapter 인스턴스를 반환합니다.
   * @returns RedisEventBusAdapter 인스턴스
   */
  getRedisEventBusAdapter(): EventBusPort {
    if (!this.eventBusAdapter) {
      this.eventBusAdapter = new RedisEventBusAdapter();
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
        this.getMessageService()
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
   * NoteService 인스턴스를 반환합니다.
   */
  getNoteService(): NoteService {
    if (!this.noteService) {
      const raw = new NoteService(this.getNoteRepository());
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
        this.getVectorStore()
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
        this.getAwsSqsAdapter(),
        this.getAwsS3Adapter()
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
      const raw = new NotificationService(this.getRedisEventBusAdapter());
      this.notificationService = createAuditProxy(raw, 'NotificationService');
    }
    return this.notificationService;
  }

  /**
   *
   * AiInteractionService 인스턴스를 반환합니다.
   */
  getAiInteractionService(): AiInteractionService {
    if (!this.aiInteractionService) {
      const raw = new AiInteractionService(this.getChatManagementService(), this.getUserService());
      this.aiInteractionService = createAuditProxy(raw, 'AiInteractionService');
    }
    return this.aiInteractionService;
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
}

export const container = Container.getInstance();
