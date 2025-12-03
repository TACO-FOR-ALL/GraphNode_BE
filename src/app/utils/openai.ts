import OpenAI from 'openai';

function normalizeError(e: any): string {
  const status = e?.status ?? e?.response?.status;
  if (status === 401) return 'unauthorized_key';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  if (status === 400) return 'bad_request';
  if (status === 500) return 'server_error';
  if (e?.name === 'AbortError') return 'aborted';
  if (e?.name === 'TimeoutError') return 'timeout';
  if (e?.message === 'key_not_found') return 'key_not_found';
  if (e?.message === 'invalid_key_format') return 'invalid_key_format';
  return 'unknown_error';
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const openAI = {
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    const client = new OpenAI({ apiKey });
    try {
      await client.models.retrieve('gpt-4o-mini', { timeout: 5000 });
      return { ok: true, data: true };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },
};
