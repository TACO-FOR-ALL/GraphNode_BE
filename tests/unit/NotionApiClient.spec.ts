import { NotionApiClient } from '../../src/infra/notion/NotionApiClient';
import { UpstreamError, ValidationError } from '../../src/shared/errors/domain';

global.fetch = jest.fn();

describe('NotionApiClient', () => {
  let client: NotionApiClient;

  beforeEach(() => {
    // 버그 픽스: 객체 형태로 생성자 인자 전달
    client = new NotionApiClient({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://redirect'
    });
    jest.resetAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('buildAuthorizeUrl', () => {
    it('returns correct OAuth URL', () => {
      const url = client.buildAuthorizeUrl('state123');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('state=state123');
      expect(url).toContain('redirect_uri=http%3A%2F%2Fredirect');
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('handles success', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token123', workspace_id: 'ws1' })
      });

      const result = await client.exchangeAuthorizationCode('code123');
      expect(result.access_token).toBe('token123');
      expect(global.fetch).toHaveBeenCalledWith('https://api.notion.com/v1/oauth/token', expect.any(Object));
    });

    it('handles 400 Validation Error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error": "invalid_grant"}'
      });

      await expect(client.exchangeAuthorizationCode('bad-code')).rejects.toThrow(ValidationError);
    });
  });

  describe('Exponential Backoff (fetchWithRetry)', () => {
    it('retries on 429 and succeeds on the second try', async () => {
      // 첫 번째 시도: 429
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1' })
      });
      // 두 번째 시도: 성공
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] })
      });

      const promise = client.searchPages('token');
      
      // setTimeout 처리를 위해 가짜 타이머 진행
      await Promise.resolve(); // flush microtasks
      jest.advanceTimersByTime(1000); 

      const result = await promise;
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });

    it('throws UpstreamError after max retries (429)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1' })
      });

      const promise = client.searchPages('token');

      // 3번의 재시도(MAX_RETRIES) 대기
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(1000);
      }

      await expect(promise).rejects.toThrow(UpstreamError);
      expect(global.fetch).toHaveBeenCalledTimes(3); // attempt는 0, 1, 2 = 3회
    });
  });
});
