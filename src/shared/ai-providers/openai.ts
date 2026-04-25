/**
 * 모듈: OpenAI-Compatible AI Provider (Vercel AI SDK)
 *
 * 책임:
 * - createOpenAI를 사용해 OpenAI 및 OpenAI 호환 모델(DeepSeek, Qwen 등)을 통합 지원합니다.
 * - streamText / generateText로 채팅 생성 및 ReAct Tool 루프를 수행합니다.
 * - S3 첨부파일 처리는 buildCoreMessages 유틸리티에 위임합니다.
 * - tool 실행 결과(이미지, 검색 링크)는 collectToolResults 헬퍼로 수집합니다.
 * - createOpenAICompatibleProvider(options) 팩토리로 호환 모델을 쉽게 추가할 수 있습니다.
 */

import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
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
  if (status === 401 || msg.includes('unauthorized') || msg.includes('invalid api key'))
    return 'unauthorized_key';
  if (status === 402 || msg.includes('billing') || msg.includes('insufficient_funds'))
    return 'insufficient_credit';
  if (status === 429) {
    if (msg.includes('quota') || msg.includes('billing') || msg.includes('insufficient'))
      return 'insufficient_credit';
    return 'rate_limited';
  }
  if (status === 400) return 'bad_request';
  if (status === 404) return 'not_found';
  if (status !== undefined && status >= 500) return 'server_error';
  if (msg.includes('network') || msg.includes('connection') || msg.includes('econnrefused'))
    return 'connection_error';
  return 'unknown_error';
}

/**
 * OpenAI 또는 OpenAI 호환 엔드포인트를 위한 IAiProvider 인스턴스를 생성합니다.
 *
 * @description
 *   baseURL을 생략하면 표준 OpenAI 엔드포인트를 사용합니다.
 *   DeepSeek, Qwen 등 OpenAI 호환 모델은 baseURL만 교체하여 재사용 가능합니다.
 * @param options.baseURL OpenAI 호환 엔드포인트 기본 URL (생략 시 OpenAI 기본값)
 * @returns IAiProvider 인스턴스
 */
export function createOpenAICompatibleProvider(options?: { baseURL?: string }): IAiProvider {
  return {
    /**
     * @description API 키 유효성을 확인합니다.
     * @param apiKey 검증할 API 키
     * @returns 유효하면 { ok: true }, 아니면 에러 코드
     */
    async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
      try {
        const openai = createOpenAI({ apiKey, baseURL: options?.baseURL });
        await generateText({
          model: openai('gpt-4o-mini'),
          messages: [{ role: 'user', content: 'Hi' }],
          maxOutputTokens: 1,
        });
        return { ok: true, data: true };
      } catch (e: any) {
        const errorMsg = normalizeError(e);
        logger.error({ errorMsg }, 'openAICompatibleProvider.checkAPIKeyValid failed');
        return { ok: false, error: errorMsg };
      }
    },

    /**
     * @description 스트리밍 또는 단일 응답으로 채팅을 생성합니다.
     *   toolCtx가 있으면 createGraphNodeTools(toolCtx)로 실제 tool을 생성합니다.
     *   tools가 전달되면 maxSteps=5로 ReAct 루프를 자동 수행합니다.
     *   generateText의 steps[]를 순회하여 tool 결과를 attachments/metadata로 수집합니다.
     * @param apiKey OpenAI API 키
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
        'openAICompatibleProvider.generateChat'
      );
      try {
        const openai: OpenAIProvider = createOpenAI({ apiKey, baseURL: options?.baseURL });
        const model = openai(params.model ?? 'gpt-4o-mini');
        const coreMessages = await buildCoreMessages(params.messages, storageAdapter);

        // toolCtx가 있으면 실제 tool 생성, 없으면 undefined (요약 생성 등 순수 텍스트 경로)
        const tools = params.toolCtx ? createGraphNodeTools(params.toolCtx) : params.tools;
        const stopWhen = tools ? stepCountIs(5) : stepCountIs(1);

        if (onStream) {
          // 스트리밍 모드: textStream으로 델타 전달, 완료 후 steps 수집
          const result = streamText({ model, messages: coreMessages, tools, stopWhen });
          let fullContent = '';
          for await (const chunk of result.textStream) {
            fullContent += chunk;
            onStream(chunk);
          }

          // 스트리밍 완료 후 steps에서 tool 결과 수집
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

        // 비스트리밍 모드: generateText 결과에서 steps 직접 수집
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
        logger.error({ err: e, errorMsg }, 'openAICompatibleProvider.generateChat failed');
        return { ok: false, error: errorMsg };
      }
    },

    /**
     * @description 사용자의 첫 메시지를 기반으로 대화 스레드 제목을 생성합니다.
     * @param apiKey OpenAI API 키
     * @param firstUserMessage 첫 번째 사용자 메시지
     * @param opts.language 생성 언어 힌트 (Optional)
     * @returns 생성된 제목 또는 'New Conversation' (실패 시 graceful 처리)
     */
    async requestGenerateThreadTitle(
      apiKey: string,
      firstUserMessage: string,
      opts?: { timeoutMs?: number; language?: string }
    ): Promise<Result<string>> {
      try {
        const openai = createOpenAI({ apiKey, baseURL: options?.baseURL });
        const langHint = opts?.language ? ` The title MUST be in ${opts.language}.` : '';
        const result = await generateText({
          model: openai('gpt-4o-mini'),
          system: `Generate a short title (max 5 words) for a chat thread.${langHint} Return ONLY the title text, no quotes or extra formatting.`,
          prompt: firstUserMessage,
          maxOutputTokens: 50,
        });
        const title = result.text.trim().replace(/^["']|["']$/g, '');
        return { ok: true, data: title || 'New Conversation' };
      } catch (e: any) {
        logger.warn(
          { err: e },
          'openAICompatibleProvider.requestGenerateThreadTitle failed — fallback'
        );
        return { ok: true, data: 'New Conversation' };
      }
    },
  };
}

/** 표준 OpenAI 엔드포인트 Provider */
export const openAiProvider = createOpenAICompatibleProvider();

/** DeepSeek OpenAI-호환 Provider */
export const deepseekProvider = createOpenAICompatibleProvider({
  baseURL: 'https://api.deepseek.com/v1',
});

export default openAiProvider;
