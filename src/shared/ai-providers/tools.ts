/**
 * 모듈: GraphNode AI 도구 정의 (Tools)
 *
 * 책임:
 * - Vercel AI SDK tool() + Zod 스키마로 3개 도구를 명세합니다.
 * - createGraphNodeTools(ctx) 팩토리로 런타임 컨텍스트(S3, API Key)를 클로저 주입합니다.
 *
 * 도구 목록:
 *   1. web_search    — Tavily Search API 기반 웹 검색
 *   2. web_scraper   — undici fetch 기반 URL 스크래핑
 *   3. image_generation — OpenAI DALL-E 3 기반 이미지 생성 + S3 저장
 */

import { tool } from 'ai';
import { z } from 'zod';
import { fetch } from 'undici';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '../utils/logger';
import { ToolExecutionContext } from './toolContext';
import { STORAGE_BUCKETS, buildStorageKey } from '../../config/storageConfig';

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 웹 검색 결과 타입
 * @param title 검색 결과 제목
 * @param url 검색 결과 URL
 * @param snippet 검색 결과 요약
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 이미지 생성 결과 타입
 * @param s3Key S3에 저장된 이미지 키 (Attachment.url로 사용)
 * @param revisedPrompt AI가 사용한 실제 프롬프트 (DALL-E가 수정한 경우 포함)
 * @param error 오류 메시지 (생성 실패 시)
 */
export interface ImageGenerationResult {
  /** S3에 저장된 이미지 키 (Attachment.url로 사용) */
  s3Key: string;
  /** AI가 사용한 실제 프롬프트 (DALL-E가 수정한 경우 포함) */
  revisedPrompt?: string;
  /** 오류 메시지 (생성 실패 시) */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTML 문자열에서 태그 및 스크립트를 제거하고 텍스트만 추출합니다.
 * @param html HTML 문자열
 * @param maxLength 추출할 텍스트의 최대 길이
 * @returns 추출된 텍스트
 */
function extractTextFromHtml(html: string, maxLength = 8000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

// ─────────────────────────────────────────────────────────────────────────────
// 팩토리
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 런타임 컨텍스트를 주입하여 GraphNode AI 도구 세트를 생성합니다.
 *
 * @param ctx - 스토리지 어댑터 및 API 키를 포함하는 실행 컨텍스트
 * @returns Vercel AI SDK 호환 ToolSet
 */
export function createGraphNodeTools(ctx: ToolExecutionContext) {
  // ───────────────────────────────────────────────
  // 1. 웹 검색 (Tavily Search API)
  // ───────────────────────────────────────────────
  const webSearchTool = tool({
    /**
     * description : AI에게 주는 Tool 설명서
     *
     */
    description:
      'Search the web for current, up-to-date information based on a query. Use this when you need recent news, facts, or data that may not be in your training data.',

    /**
     * inputSchema : AI에게 전달할 파라미터
     *
     */
    inputSchema: z.object({
      query: z.string().describe('The search query to look up on the web'),
    }),

    /**
     * execute : Tool 실행
     * @param param0 {query}: 쿼리
     * @returns {results: WebSearchResult[]; error?: string} : 결과
     */
    execute: async ({ query }): Promise<{ results: WebSearchResult[]; error?: string }> => {
      logger.info({ query }, '[web_search] tool invoked');

      // 우선 tavily api key 검증, 없으면 실행 불가?
      if (!ctx.tavilyApiKey) {
        logger.warn('[web_search] TAVILY_API_KEY not set — returning empty results');
        return { results: [], error: 'Web search is not configured (TAVILY_API_KEY missing)' };
      }

      try {
        // Tavily api 호출
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: ctx.tavilyApiKey,
            query,
            search_depth: 'basic',
            max_results: 5,
            include_answer: false,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
          logger.error({ status: response.status, query }, '[web_search] Tavily API error');
          return { results: [], error: `Tavily API error: ${response.status}` };
        }

        // 웹사이트 검색 결과 파싱
        const data = (await response.json()) as {
          results?: Array<{ title: string; url: string; content: string }>;
        };

        // results에 데이터가 없으면빈배열 반환
        const results: WebSearchResult[] = (data.results ?? []).map((r) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          snippet: (r.content ?? '').slice(0, 300),
        }));

        logger.info({ query, resultCount: results.length }, '[web_search] completed');
        return { results };
      } catch (e: any) {
        logger.error({ err: e, query }, '[web_search] failed');
        return { results: [], error: e?.message ?? 'Unknown error during web search' };
      }
    },
  });

  // ───────────────────────────────────────────────
  // 2. 웹 스크래퍼 (undici fetch)
  // ───────────────────────────────────────────────
  const webScraperTool = tool({
    // AI Tool 설명서
    description:
      'Fetch and extract the text content from a specific webpage URL. Use this after web_search to read the full content of a page.',

    // AI에게 전달할 파라미터
    inputSchema: z.object({
      url: z.string().url().describe('The full URL of the webpage to scrape'),
    }),

    /**
     * execute : Tool 실행
     * @param param0 {url}: URL
     * @returns {content: string; error?: string} : 결과
     */
    execute: async ({ url }): Promise<{ content: string; error?: string }> => {
      logger.info({ url }, '[web_scraper] tool invoked');

      try {
        // 웹페이지 요청
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GraphNodeBot/1.0)',
            Accept: 'text/html,application/xhtml+xml',
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) {
          return { content: '', error: `HTTP ${response.status} from ${url}` };
        }

        // Content-Type 체크
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          return { content: '', error: `Unsupported content type: ${contentType}` };
        }

        // 텍스트로 변환 및 정제
        const html = await response.text();
        const text = extractTextFromHtml(html);

        logger.info({ url, textLength: text.length }, '[web_scraper] completed');
        return { content: text };
      } catch (e: any) {
        logger.error({ err: e, url }, '[web_scraper] failed');
        return { content: '', error: e?.message ?? 'Unknown error during scraping' };
      }
    },
  });

  // ───────────────────────────────────────────────
  // 3. 이미지 생성 (OpenAI DALL-E 3 + S3 저장)
  // ───────────────────────────────────────────────
  const imageGenerationTool = tool({
    // AI Tool 서술
    description:
      'Generate a high-quality image from a detailed text description using DALL-E 3. The generated image will be saved and returned as an attachment.',

    // AI에게 전달할 파라미터
    inputSchema: z.object({
      prompt: z
        .string()
        .describe('A detailed description of the image to generate. More detail = better results.'),
      size: z
        .enum(['1024x1024', '1792x1024', '1024x1792'])
        .optional()
        .default('1024x1024')
        .describe('Image dimensions. Use 1792x1024 for landscape, 1024x1792 for portrait.'),
    }),

    /**
     * Tool 실행
     * @param prompt DALL-E 3 이미지 생성 요청
     * @param size 이미지 생성 요청
     * @returns s3Key, revisedPrompt, error 이미지 생성 결과
     */
    execute: async ({ prompt, size }): Promise<ImageGenerationResult> => {
      logger.info({ prompt: prompt.slice(0, 80), size }, '[image_generation] tool invoked');

      try {
        const openai = new OpenAI({ apiKey: ctx.openaiApiKey });

        // dall e 3 통해ㅓㅅ 이미지 생성 호출 요청 처리
        const imageResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: size ?? '1024x1024',
          response_format: 'b64_json',
        });

        // DALL-E 3 응답 파싱
        const b64 = imageResponse.data?.[0]?.b64_json;
        const revisedPrompt = imageResponse.data?.[0]?.revised_prompt;

        // b64가 없으면 에러 반환
        if (!b64) {
          logger.error({ prompt }, '[image_generation] DALL-E returned no image data');
          return { s3Key: '', error: 'DALL-E returned no image data' };
        }

        // Base64 → Buffer → S3 저장
        const imageBuffer = Buffer.from(b64, 'base64');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const s3Key = buildStorageKey(STORAGE_BUCKETS.AI_GENERATED, `${uuidv4()}-${date}.png`);

        await ctx.storageAdapter.upload(s3Key, imageBuffer, 'image/png', { bucketType: 'file' });

        logger.info({ s3Key, revisedPrompt }, '[image_generation] image saved to S3');
        return { s3Key, revisedPrompt };
      } catch (e: any) {
        logger.error({ err: e, prompt }, '[image_generation] failed');
        return { s3Key: '', error: e?.message ?? 'Unknown error during image generation' };
      }
    },
  });

  return {
    web_search: webSearchTool,
    web_scraper: webScraperTool,
    image_generation: imageGenerationTool,
  } as const;
}

/**
 * createGraphNodeTools()의 반환 타입
 * Provider 파일에서 타입 참조용
 */
export type GraphNodeTools = ReturnType<typeof createGraphNodeTools>;
