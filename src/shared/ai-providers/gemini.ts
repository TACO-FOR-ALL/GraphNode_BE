import { GoogleGenerativeAI } from '@google/generative-ai';

import { IAiProvider, Result } from './IAiProvider';
import { ChatMessageRequest } from './ChatMessageRequest';

export const geminiProvider: IAiProvider = {
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' }); // or gemini-1.5-flash
      await model.generateContent('Hi');
      return { ok: true, data: true };
    } catch (e: any) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  async requestWithoutStream(apiKey: string, modelName: string, messages: ChatMessageRequest[]) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Gemini는 modelName이 'gemini-pro', 'gemini-1.5-flash' 등이어야 함
      const model = genAI.getGenerativeModel({ model: modelName });

      // 메시지 히스토리 변환 (Gemini ChatSession 활용)
      // 마지막 메시지는 user input으로 분리 필요
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user', // system role is handled differently or merged
        parts: [{ text: m.content as string }],
      }));

      const lastMsg = messages[messages.length - 1];
      const chat = model.startChat({
        history,
        generationConfig: { maxOutputTokens: 4096 },
      });

      const result = await chat.sendMessage(lastMsg.content as string);
      const response = await result.response;
      const text = response.text();

      // OpenAI 포맷 호환
      const openAiLikeResponse = {
        choices: [{ message: { content: text } }],
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

  async createResponse() {
    return { ok: false, error: 'not_implemented' };
  },

  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      const prompt = `Generate a thread title based on the message below in 20 letters or less. Return ONLY the JSON object {"title": "..."}. Message: "${firstUserMessage}"`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      try {
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const { title } = JSON.parse(jsonStr);
        if (title) return { ok: true, data: title };
      } catch {
        // fallback
      }

      return { ok: true, data: firstUserMessage.slice(0, 15) };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  async uploadFile() { return { ok: false, error: 'Not implemented' }; },
  async createThread() { return { ok: false, error: 'Not implemented' }; },
  async createAssistant() { return { ok: false, error: 'Not implemented' }; },
  async addMessage() { return { ok: false, error: 'Not implemented' }; },
  async runAssistantStream() { return { ok: false, error: 'Not implemented' }; },
  async downloadFile() { return { ok: false, error: 'Not implemented' }; },
};

function normalizeError(e: any): string {
  // GoogleGenerativeAI Error Mapping (간소화)
  const msg = e.message || '';
  if (msg.includes('API key not valid')) return 'unauthorized_key';
  if (msg.includes('429')) return 'rate_limited';
  return 'unknown_error';
}
