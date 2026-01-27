/**
 * 목적: AiInteractionService 유닛 테스트.
 */
import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';

jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn().mockReturnValue({
    checkAPIKeyValid: jest.fn().mockResolvedValue({ ok: true, data: true }),
    requestWithoutStream: jest.fn(),
    request: jest.fn(),
  }),
}));

describe('AiInteractionService', () => {
  let service: AiInteractionService;
  let mockChatSvc: jest.Mocked<ChatManagementService>;
  let mockUserSvc: jest.Mocked<UserService>;

  beforeEach(() => {
    mockChatSvc = {} as any;
    mockUserSvc = {
      getApiKeys: jest.fn(),
    } as any;

    service = new AiInteractionService(mockChatSvc, mockUserSvc);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
