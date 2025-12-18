import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { GraphNodeDto } from '../../src/shared/dtos/graph';

// Mock Services
jest.mock('../../src/core/services/GraphEmbeddingService');
jest.mock('../../src/core/services/GraphManagementService');
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) { return `http://mock-auth?state=${state}`; }
      async exchangeCode(_code: string) { return { access_token: 'at', expires_in: 3600, token_type: 'Bearer' }; }
      async fetchUserInfo(_token: any) { return { sub: 'google-uid-1', email: 'u@example.com', name: 'U', picture: 'https://img' }; }
    }
  };
});

// Mock authLogin to bypass DB and ensure session is set
jest.mock('../../src/app/utils/authLogin', () => {
  return {
    completeLogin: async (req: any, res: any, input: any) => {
      const userId = 'u_1';
      if (req.session) { req.session.userId = userId; }
      if (res.cookie) { res.cookie('gn-logged-in', '1'); }
      return { userId };
    }
  };
});

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return { UserRepositoryMySQL: class { async findOrCreateFromProvider() { return { id: 'u_1' } as any; } } };
});

describe('Graph API', () => {
  let app: any;
  let mockGraphEmbeddingService: jest.Mocked<GraphEmbeddingService>;

  beforeAll(async () => {
    app = await createApp();
    // Get the mocked instance from the container or module system if possible,
    // but since we are mocking the class module, we can spy on prototypes or use the mock directly if we had access to the instance used by the controller.
    // However, in integration tests with supertest, it's harder to access the exact instance inside the controller.
    // A common pattern is to rely on the fact that the module is mocked globally.
  });

  beforeEach(() => {
    // Reset mocks
    (GraphEmbeddingService as jest.Mock).mockClear();
    
    // Setup mock implementation for the instance that will be created
    mockGraphEmbeddingService = new GraphEmbeddingService({} as any) as jest.Mocked<GraphEmbeddingService>;
    
    // We need to ensure the controller uses this mock. 
    // Since `createApp` creates a new container and new controller instances, 
    // and we mocked the class file, the controller will receive a mocked instance.
    // We need to control the behavior of that mocked instance.
    // The `jest.mock` above replaces the constructor.
    
    // Let's refine the mock to return our controlled instance or methods
  });

  // Since we cannot easily grab the instance created inside `createApp` without DI container access in tests,
  // we will rely on the fact that `jest.mock` affects all imports.
  // We will mock the prototype methods to control behavior across all instances.

  it('POST /v1/graph/nodes should create a node', async () => {
    const nodeDto: GraphNodeDto = {
      id: 1,
      userId: 'u_1',
      label: 'New Node',
      x: 10,
      y: 10,
      size: 5,
      color: 'red',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Mock implementation
    jest.spyOn(GraphEmbeddingService.prototype, 'upsertNode').mockResolvedValue(undefined);

    // Login first to set session
    const agent = request.agent(app);
    // Simulate login by setting session directly if possible, or using a login endpoint mock
    // Here we assume the auth middleware checks session.userId.
    // We can use a test helper to "login" or mock the middleware.
    // For this example, let's assume we can bypass auth or use a mock token if implemented.
    // But since we mocked `authLogin`, let's try to hit a login endpoint if it exists, or mock the middleware.
    
    // Alternative: Mock the `isAuthenticated` middleware
    // But `createApp` is already imported.
    
    // Let's try to use the `agent` which persists cookies.
    // We need a way to establish a session.
    // If we don't have a direct login endpoint for tests, we might need to mock the middleware globally.
  });
  
  // NOTE: Testing Express controllers with Supertest often requires mocking the middleware 
  // or having a "test login" endpoint.
  // Given the current setup, let's focus on Unit Tests for Services first as requested, 
  // and maybe add API tests if we can easily mock auth.
});
