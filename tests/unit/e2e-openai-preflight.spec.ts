import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  isUsableOpenAiKeyShape,
  openAiApiPreflightOk,
} from '../e2e/utils/e2e-openai-preflight';

describe('e2e-openai-preflight', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('isUsableOpenAiKeyShape rejects placeholder and dummy', () => {
    expect(isUsableOpenAiKeyShape('sk-placeholder')).toBe(false);
    expect(isUsableOpenAiKeyShape('dummy')).toBe(false);
    expect(isUsableOpenAiKeyShape('sk-proj-valid-looking')).toBe(true);
  });

  it('openAiApiPreflightOk returns true on GET /v1/models HTTP 200', async () => {
    fetchMock.mockResolvedValue({ status: 200 } as Response);
    await expect(openAiApiPreflightOk('sk-test')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('openAiApiPreflightOk returns false on HTTP 401', async () => {
    fetchMock.mockResolvedValue({ status: 401 } as Response);
    await expect(openAiApiPreflightOk('sk-bad')).resolves.toBe(false);
  });
});
