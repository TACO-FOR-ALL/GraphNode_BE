/**
 * 모듈: Google Gemini AI Provider (Vercel AI SDK)
 *
 * 책임:
 * - createGoogleGenerativeAI를 사용해 Gemini 모델 호출을 수행합니다.
 * - streamText / generateText로 채팅 생성 및 ReAct Tool 루프를 수행합니다.
 * - S3 첨부파일 처리는 buildCoreMessages 유틸리티에 위임합니다.
 * - tool 실행 결과(이미지, 검색 링크)는 collectToolResults 헬퍼로 수집합니다.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, stepCountIs } from 'ai';

import { IAiProvider, Result, AiResponse, ChatGenerationParams } from './IAiProvider';
import { StoragePort } from '../../core/ports/StoragePort';
import { buildCoreMessages } from './coreMessageBuilder';
import { createGraphNodeTools } from './tools';
import { collectToolResults } from './toolResultCollector';
import { logger } from '../utils/logger';

function normalizeError(e: any): string {
  const status = e?.status ?? e?.statusCode ?? e?.cause?.status;
  const msg = (e?.message ?? e?.cause?.message ?? '').toLowerCase();
  if (status === 401 || msg.includes('unauthenticated') || msg.includes('api key not valid') || msg.includes('invalid api key')) return 'unauthorized_key';
  if (status === 403 || msg.includes('permission_denied')) return 'forbidden';
  if (status === 429 || msg.includes('resource_exhausted')) {
    if (msg.includes('billing') || msg.includes('payment') || msg.includes('free tier')) return 'insufficient_credit';
    return 'rate_limited';
  }
  if (status === 400 || msg.includes('invalid_argument')) return 'bad_request';
  if (status === 404) return 'not_found';
  if (status !== undefined && status >= 500) return 'server_error';
  if (msg.includes('network') || msg.includes('connection') || msg.includes('econnrefused')) return 'connection_error';
  return 'unknown_error';
}

export const geminiProvider: IAiProvider = {
  /**
   * @description Gemini API 키 유효성을 검사합니다.
   * @param apiKey Google API 키
   * @returns 유효하면 { ok: true }, 아니면 에러 코드
   */
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    if (!apiKey || apiKey.trim().length === 0) return { ok: false, error: 'empty_api_key' };
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      await generateText({ model: google('gemini-2.0-flash'), messages: [{ role: 'user', content: 'Hi' }], maxOutputTokens: 1 });
      return { ok: true, data: true };
    } catch (e: any) {
      const errorMsg = normalizeError(e);
      logger.error({ errorMsg }, 'geminiProvider.checkAPIKeyValid failed');
      return { ok: false, error: errorMsg };
    }
  },

  /**
   * @description 스트리밍 또는 단일 응답으로 채팅을 생성합니다.
   *   toolCtx가 있으면 createGraphNodeTools(toolCtx)로 실제 tool을 생성합니다.
   *   tools가 전달되면 maxSteps=5로 ReAct 루프를 자동 수행합니다.
   *   generateText의 steps[]를 순회하여 tool 결과를 attachments/metadata로 수집합니다.
   * @param apiKey Google API 키
   * @param params 채팅 생성 파라미터 (model, messages, tools, toolCtx)
   * @param onStream 스트리밍 텍스트 델타 콜백 (Optional)
   * @param storageAdapter S3 첨부파일 처리용 어댑터 (buildCoreMessages용, Optional)
   * @returns 생성 결과 또는 에러
   */
  async generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>> {
    logger.info(
      { model: params.model, msgCount: params.messages.length, hasTools: !!params.toolCtx },
      'geminiProvider.generateChat'
    );
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const model = google(params.model ?? 'gemini-2.0-flash');
      const coreMessages = await buildCoreMessages(params.messages, storageAdapter);

      const tools = params.toolCtx ? createGraphNodeTools(params.toolCtx) : params.tools;
      const stopWhen = tools ? stepCountIs(5) : stepCountIs(1);

      if (onStream) {
        const result = streamText({ model, messages: coreMessages, tools, stopWhen });
        let fullContent = '';
        for await (const chunk of result.textStream) {
          fullContent += chunk;
          onStream(chunk);
        }

        const finalSteps = await result.steps;
        const collected = collectToolResults(finalSteps);

        return {
          ok: true,
          data: {
            content: fullContent,
            attachments: collected.attachments,
            metadata: collected.metadata,
          },
        };
      }

      const result = await generateText({ model, messages: coreMessages, tools, stopWhen });
      const collected = collectToolResults(result.steps);

      return {
        ok: true,
        data: {
          content: result.text,
          attachments: collected.attachments,
          metadata: collected.metadata,
        },
      };
    } catch (e: any) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'geminiProvider.generateChat failed');
      return { ok: false, error: errorMsg };
    }
  },

  /**
   * @description 사용자의 첫 메시지를 기반으로 대화 스레드 제목을 생성합니다.
   * @param apiKey Google API 키
   * @param firstUserMessage 첫 번째 사용자 메시지
   * @param opts.language 생성 언어 힌트 (Optional)
   * @returns 생성된 제목 또는 폴백 (실패 시 graceful 처리)
   */
  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number; language?: string }
  ): Promise<Result<string>> {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const langHint = opts?.language ? ` The title MUST be in ${opts.language}.` : '';
      const result = await generateText({
        model: google('gemini-2.0-flash'),
        system: `Generate a short title (max 5 words) for a chat thread.${langHint} Return ONLY the title text, no quotes or extra formatting.`,
        prompt: firstUserMessage,
        maxOutputTokens: 50,
      });
      const title = result.text.trim().replace(/^["']|["']$/g, '');
      return { ok: true, data: title || 'New Conversation' };
    } catch (e: any) {
      logger.warn({ err: e }, 'geminiProvider.requestGenerateThreadTitle failed — fallback');
      return { ok: true, data: 'New Conversation' };
    }
  },
};

export default geminiProvider;
