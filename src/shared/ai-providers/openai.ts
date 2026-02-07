// services/openai.ts
import OpenAI from 'openai';

import { ChatMessageRequest } from './ChatMessageRequest';
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * 오류 객체를 정규화하여 문자열로 반환합니다.
 * @param e 오류 객체
 * @returns 정규화된 오류 문자열
 */
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
} // 오류 검출 코드

export const openAI = {
  /**
   * OPENAI API Key 유효성 검사
   * @param apiKey  검사할 API Key
   * @returns 검사 결과 (성공 시 true, 실패 시 오류 메시지)
   */
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    const client = new OpenAI({ apiKey });
    try {
      await client.models.retrieve('gpt-4o-mini', { timeout: 3000 });
      return { ok: true, data: true };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  }, //api 키 검사 있으면 정상적으로 통과 api 키에 오류가 있으면 오류 함수로 이동, async는 시간이 걸리는 작업

  /**
   * OPENAI API 요청
   * @param apiKey  API Key
   * @param stream  스트리밍 여부
   * @param model  모델 이름
   * @param messages  메시지 배열
   * @returns 요청 결과
   */
  async requestWithoutStream(apiKey: string, model: string, messages: ChatMessageRequest[]) {
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const p = await client.chat.completions.create({
        model,
        messages: messages as any, // Type casting to bypass union mismatch
      });
      //console.log('request', p);
      return { ok: true, data: p } as Result<typeof p>;
    } catch (e) {
      return { ok: false, error: normalizeError(e) } as Result<never>;
    }
  },

  /**
   * OPENAI API 요청
   * @param apiKey  API Key
   * @param stream  스트리밍 여부
   * @param model  모델 이름
   * @param messages  메시지 배열
   * @returns 요청 결과
   */
  async request(apiKey: string, stream: boolean, model: string, messages: ChatMessageRequest[]) {
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const p = await client.chat.completions.create({
        model,
        messages: messages as any,
        stream,
      });
      //console.log('request', p);
      return { ok: true, data: p } as Result<typeof p>;
    } catch (e) {
      return { ok: false, error: normalizeError(e) } as Result<never>;
    }
  },

  /**
   * OPENAI API 스트리밍 요청
   */
  async requestStream(
    apiKey: string,
    model: string,
    messages: ChatMessageRequest[]
  ): Promise<Result<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>> {
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const stream = await client.chat.completions.create({
        model,
        messages: messages as any,
        stream: true,
      });
      return { ok: true, data: stream };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OPENAI API를 사용하여 채팅방 제목을 생성합니다.
   * @param apiKey  API Key
   * @param firstUserMessage  첫 번째 사용자 메시지
   * @param opts  옵션 (예: 타임아웃)
   * @returns 생성된 채팅방 제목 또는 오류 메시지
   */
  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>> {
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const p = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that generates thread titles based on the first user message in 20 letters or less.',
          },
          {
            role: 'user',
            content:
              `아래 메시지에 어울리는 채팅방 제목을 만들어.\n` +
              `메시지: """${firstUserMessage}"""\n` +
              `반드시 {"title":"..."} 형태의 JSON만 반환해.`,
          },
        ],
      });
      const text = p.choices?.[0]?.message?.content ?? '{}';
      try {
        const { title } = JSON.parse(text);
        const t = (title as string)?.trim();
        if (t) return { ok: true, data: t };
      } catch {
        /* fallback */
      }
      const fallback = firstUserMessage.slice(0, 15) + (firstUserMessage.length > 15 ? '…' : '');
      return { ok: true, data: fallback };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  // --- Assistants API Implementation ---

  /**
   * OpenAI 파일 업로드
   * @param apiKey 
   * @param file 
   * @param purpose 
   * @returns 
   */
  async uploadFile(
    apiKey: string,
    file: { buffer: Buffer; filename: string; mimetype: string },
    purpose: 'assistants' | 'vision' = 'assistants'
  ): Promise<Result<{ fileId: string }>> {
    try {
      const client = new OpenAI({ apiKey });
      // OpenAI expects a File object or ReadStream.
      // We create a File-like object from buffer.
      const fileObj = await import('openai/uploads').then((m) =>
        m.toFile(file.buffer, file.filename, { type: file.mimetype })
      );
      
      const response = await client.files.create({
        file: fileObj,
        purpose: purpose,
      });
      return { ok: true, data: { fileId: response.id } };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OpenAI 스레드 생성
   * @param apiKey 
   * @returns 
   */
  async createThread(apiKey: string): Promise<Result<{ threadId: string }>> {
    try {
      const client = new OpenAI({ apiKey });
      const thread = await client.beta.threads.create();
      return { ok: true, data: { threadId: thread.id } };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OpenAI Assistant 생성
   * @param apiKey 
   * @returns 
   */
  async createAssistant(apiKey: string): Promise<Result<{ assistantId: string }>> {
    try {
      const client = new OpenAI({ apiKey });
      const assistant = await client.beta.assistants.create({
        name: 'GraphNode User Assistant',
        instructions: 'You are a helpful assistant for the GraphNode application.',
        model: 'gpt-4o', // Default model
        tools: [{ type: 'file_search' }], // Enable RAG by default
      });
      return { ok: true, data: { assistantId: assistant.id } };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * 
   * @param apiKey 
   * @param threadId 
   * @param role 
   * @param content 
   * @param fileIds 
   * @returns 
   */
  async addMessage(
    apiKey: string,
    threadId: string,
    role: 'user' | 'assistant',
    content: string | Array<any>,
    fileIds: string[] = []
  ): Promise<Result<any>> {
    try {
      const client = new OpenAI({ apiKey });
      
      const attachments = fileIds.map((fileId) => ({
        file_id: fileId,
        tools: [{ type: 'file_search' as const }], // 기본적으로 file_search 활성화
      }));

      const msg = await client.beta.threads.messages.create(threadId, {
        role: role,
        content: content,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      return { ok: true, data: msg };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * 
   * @param apiKey 
   * @param assistantId 
   * @param threadId 
   * @returns 
   */
  async runAssistantStream(
    apiKey: string,
    assistantId: string,
    threadId: string
  ): Promise<Result<AsyncIterable<any>>> {
    try {
      const client = new OpenAI({ apiKey });
      const stream = await client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        stream: true,
      });
      return { ok: true, data: stream };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },
};

export default openAI;
