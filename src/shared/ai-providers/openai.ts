import OpenAI from 'openai';

import { ChatMessageRequest } from './ChatMessageRequest';
import { logger } from '../../shared/utils/logger'; // Logger import added

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
    logger.info({ apiKey: '***' }, 'openAI.checkAPIKeyValid called');
    const client = new OpenAI({ apiKey });
    try {
      await client.models.retrieve('gpt-4o-mini', { timeout: 3000 });
      logger.info('openAI.checkAPIKeyValid succeeded');
      return { ok: true, data: true };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.checkAPIKeyValid failed');
      return { ok: false, error: errorMsg };
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
    logger.info({ model, messageCount: messages.length }, 'openAI.requestWithoutStream called');
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const p = await client.chat.completions.create({
        model,
        messages: messages as any, // Type casting to bypass union mismatch
      });
      //console.log('request', p);
      logger.info('openAI.requestWithoutStream succeeded');
      return { ok: true, data: p } as Result<typeof p>;
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.requestWithoutStream failed');
      return { ok: false, error: errorMsg } as Result<never>;
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
    logger.info({ model, stream, messageCount: messages.length }, 'openAI.request called');
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const p = await client.chat.completions.create({
        model,
        messages: messages as any,
        stream,
      });
      //console.log('request', p);
      logger.info('openAI.request succeeded');
      return { ok: true, data: p } as Result<typeof p>;
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.request failed');
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
    logger.info({ model, messageCount: messages.length }, 'openAI.requestStream called');
    try {
      const client = new OpenAI({ apiKey: apiKey });
      const stream = await client.chat.completions.create({
        model,
        messages: messages as any,
        stream: true,
      });
      logger.info('openAI.requestStream succeeded');
      return { ok: true, data: stream };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.requestStream failed');
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OPENAI Responses API 요청 (OpenAI Responses)
   */
  async createResponse(
    apiKey: string,
    params: {
      model: string;
      input: any[];
      tools?: any[];
      tool_resources?: any;
      previous_response_id?: string;
      fileIds?: string[];
      store? : boolean;
    }
  ): Promise<Result<AsyncIterable<any>>> {
    logger.info({ model: params.model }, 'openAI.createResponse called');
    try {
      const client = new OpenAI(
        { apiKey,
          timeout: 600000,  //  10분 타임아웃
         });
      
      // OpenAI SDK v4.56.0+ should have client.responses
      const responsesClient = client.responses;

      if (!responsesClient) {
          logger.error('OpenAI SDK does not support responses API yet');
          return { ok: false, error: 'sdk_version_incompatible' };
      }

      const createParams: any = {
        model: params.model,
        input: params.input,
        stream: true,
        include: [
          'file_search_call.results',
          'web_search_call.results',
          'web_search_call.action.sources',
          'message.input_image.image_url',
          'computer_call_output.output.image_url',
          'code_interpreter_call.outputs',
          'message.output_text.logprobs'
        ],
      };

      if (params.tools) createParams.tools = params.tools;
      if (params.tool_resources) createParams.tool_resources = params.tool_resources;
      if (params.previous_response_id) createParams.previous_response_id = params.previous_response_id;
      if (params.store !== undefined) createParams.store = params.store;

      const stream = await responsesClient.create(createParams);

      logger.info('openAI.createResponse succeeded');
      return { ok: true, data: stream as unknown as AsyncIterable<any> };
    } catch (e: any) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.createResponse failed');
      return { ok: false, error: errorMsg };
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
    logger.info({ msgLength: firstUserMessage.length }, 'openAI.requestGenerateThreadTitle called');
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
        if (t) {
            logger.info({ title: t }, 'openAI.requestGenerateThreadTitle succeeded');
            return { ok: true, data: t };
        }
      } catch {
        /* fallback */
      }
      const fallback = firstUserMessage.slice(0, 15) + (firstUserMessage.length > 15 ? '…' : '');
      logger.info({ fallback }, 'openAI.requestGenerateThreadTitle fallback used');
      return { ok: true, data: fallback };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.requestGenerateThreadTitle failed');
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
    logger.info({ filename: file.filename, mimetype: file.mimetype, purpose }, 'openAI.uploadFile called');
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
      logger.info({ fileId: response.id }, 'openAI.uploadFile succeeded');
      return { ok: true, data: { fileId: response.id } };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.uploadFile failed');
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OpenAI 스레드 생성
   * @param apiKey 
   * @returns 
   */
  async createThread(apiKey: string): Promise<Result<{ threadId: string }>> {
    logger.info('openAI.createThread called');
    try {
      const client = new OpenAI({ apiKey });
      const thread = await client.beta.threads.create();
      logger.info({ threadId: thread.id }, 'openAI.createThread succeeded');
      return { ok: true, data: { threadId: thread.id } };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.createThread failed');
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OpenAI Assistant 생성
   * @param apiKey 
   * @returns 
   */
  async createAssistant(apiKey: string): Promise<Result<{ assistantId: string }>> {
    logger.info('openAI.createAssistant called');
    try {
      const client = new OpenAI({ apiKey });
      const assistant = await client.beta.assistants.create({
        name: 'GraphNode User Assistant',
        instructions: 'You are a helpful assistant for the GraphNode application.',
        model: 'gpt-4o', // Default model
        tools: [
          { type: 'file_search' },
          { type: 'code_interpreter' },
        ], // Enable RAG and Code Interpreter by default
      });
      logger.info({ assistantId: assistant.id }, 'openAI.createAssistant succeeded');
      return { ok: true, data: { assistantId: assistant.id } };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.createAssistant failed');
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
    logger.info({ threadId, role, fileCount: fileIds.length }, 'openAI.addMessage called');
    try {
      const client = new OpenAI({ apiKey });
      
      const attachments = fileIds.map((fileId) => ({
        file_id: fileId,
        tools: [
          { type: 'file_search' as const },
          { type: 'code_interpreter' as const }
        ],
      }));

      const msg = await client.beta.threads.messages.create(threadId, {
        role: role,
        content: content,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      logger.info({ msgId: msg.id }, 'openAI.addMessage succeeded');
      return { ok: true, data: msg };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.addMessage failed');
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
    logger.info({ assistantId, threadId }, 'openAI.runAssistantStream called');
    try {
      const client = new OpenAI({ apiKey });
      const stream = await client.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        stream: true,
      });
      logger.info('openAI.runAssistantStream succeeded (stream started)');
      return { ok: true, data: stream };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.runAssistantStream failed');
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * OpenAI 파일 다운로드
   * @param apiKey API Key
   * @param fileId 파일 ID
   */
  async downloadFile(
    apiKey: string,
    fileId: string
  ): Promise<Result<{ buffer: Buffer; filename?: string; mimeType?: string }>> {
    logger.info({ fileId }, 'openAI.downloadFile called');
    try {
      const client = new OpenAI({ apiKey });
      
      // 1. 파일 정보 조회 (파일명 등)
      let filename = 'unknown.bin';
      try {
        const fileInfo = await client.files.retrieve(fileId);
        filename = fileInfo.filename;
      } catch (e) {
        logger.warn({ fileId, err: e }, 'Failed to retrieve file info, using default filename');
      }

      // 2. 파일 콘텐츠 다운로드
      const response = await client.files.content(fileId);
      
      // OpenAI SDK returns a fetch-like Response object (or structured object depending on version)
      // We assume it supports arrayBuffer() or we can get text/buffer from it.
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // MimeType 추론 (간단히 확장자 기반) or default to octet-stream
      let mimeType = 'application/octet-stream';
      if (filename.endsWith('.png')) mimeType = 'image/png';
      else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (filename.endsWith('.csv')) mimeType = 'text/csv';
      else if (filename.endsWith('.json')) mimeType = 'application/json';
      else if (filename.endsWith('.txt')) mimeType = 'text/plain';

      logger.info({ fileId, size: buffer.length }, 'openAI.downloadFile succeeded');
      return { ok: true, data: { buffer, filename, mimeType } };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.downloadFile failed');
      return { ok: false, error: errorMsg };
    }
  },
};

export default openAI;
