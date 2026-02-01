import Anthropic from '@anthropic-ai/sdk';

import { IAiProvider, Result } from './IAiProvider';
import { ChatMessageRequest } from './ChatMessageRequest';

export const claudeProvider: IAiProvider = {
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    try {
      const client = new Anthropic({ apiKey });
      // 간단한 모델 리스트 조회 대신, 최소 토큰으로 테스트 요청을 보냄 (모델 리스트 API가 없을 수도 있음)
      await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return { ok: true, data: true };
    } catch (e: any) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  async requestWithoutStream(apiKey: string, model: string, messages: ChatMessageRequest[]) {
    try {
      const client = new Anthropic({ apiKey });
      const systemMessage = messages.find((m) => m.role === 'system')?.content as
        | string
        | undefined;
      const userMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
        }));

      const response = await client.messages.create({
        model: model,
        max_tokens: 4096,
        system: systemMessage,
        messages: userMessages,
      });

      // OpenAI 포맷과 유사하게 변환하여 리턴 (호환성 유지)
      const content = response.content[0].type === 'text' ? response.content[0].text : '';

      const openAiLikeResponse = {
        choices: [{ message: { content } }],
      };

      return { ok: true, data: openAiLikeResponse };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  async request(apiKey: string, stream: boolean, model: string, messages: ChatMessageRequest[]) {
    if (stream) {
      throw new Error('Stream not fully implemented in adapter example yet');
    }
    return this.requestWithoutStream(apiKey, model, messages);
  },

  async requestStream(
    apiKey: string,
    model: string,
    messages: ChatMessageRequest[]
  ): Promise<Result<AsyncIterable<any>>> {
    return { ok: false, error: 'not_implemented' };
  },

  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>> {
    try {
      // Claude는 JSON 모드가 엄격하지 않을 수 있으므로, 프롬프트로 제어
      const prompt = `You are a helpful assistant. Generate a thread title based on the message below in 20 letters or less. Return ONLY the JSON object {"title": "..."}. Message: "${firstUserMessage}"`;

      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

      try {
        // Claude가 텍스트로 설명을 붙일 수 있으므로 JSON 파싱 시도
        // JSON 포맷을 찾기 위해 '{' 와 '}' 사이를 추출
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const { title } = JSON.parse(jsonStr);
        if (title) return { ok: true, data: title };
      } catch {
        // 파싱 실패 시 fallback
      }

      const fallback = firstUserMessage.slice(0, 15) + (firstUserMessage.length > 15 ? '…' : '');
      return { ok: true, data: fallback };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  async uploadFile() { return { ok: false, error: 'Not implemented' }; },
  async createThread() { return { ok: false, error: 'Not implemented' }; },
  async addMessage() { return { ok: false, error: 'Not implemented' }; },
  async runAssistantStream() { return { ok: false, error: 'Not implemented' }; },
};

function normalizeError(e: any): string {
  // Anthropic Error Mapping
  if (e instanceof Anthropic.AuthenticationError) return 'unauthorized_key';
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.NotFoundError) return 'not_found';
  if (e instanceof Anthropic.BadRequestError) return 'bad_request';
  if (e instanceof Anthropic.APIConnectionError) return 'connection_error';
  if (e instanceof Anthropic.APIError) return 'server_error';
  return 'unknown_error';
}
