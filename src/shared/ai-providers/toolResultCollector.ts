/**
 * 모듈: Provider 공통 Tool 결과 수집 헬퍼
 *
 * 책임:
 * - Vercel AI SDK generateText() 결과의 steps[]를 순회하여
 *   tool 실행 결과(이미지 S3 키, 검색 링크 등)를 Attachment / metadata로 변환합니다.
 * - openai / claude / gemini Provider 구현체가 공통으로 사용합니다.
 * - AI SDK v5+ 에서 result→output, args→input 으로 필드명 변경됨. 양쪽 모두 지원.
 */

import { v4 as uuidv4 } from 'uuid';
import { Attachment } from '../dtos/ai';
import { ImageGenerationResult, WebSearchResult } from './tools';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Interface — Vercel AI SDK 전체 타입 대신 사용하는 필드만 선언
// ─────────────────────────────────────────────────────────────────────────────

/**
 * collectToolResults가 실제로 접근하는 필드만 선언한 최소 ToolResult 인터페이스.
 *
 * @description
 *   AI SDK v5+ (ai ^5.0 / ^6.0) 에서 TypedToolResult의 필드명이 변경됨:
 *     args   → input   (입력 인수)
 *     result → output  (실행 결과)
 *
 *   하위 호환을 위해 구버전 필드(args, result)도 optional로 유지하고,
 *   실제 값 추출 시 신버전 필드를 우선한다 (output ?? result, input ?? args).
 *
 *   필드명 alias 처리:
 *   - toolName / type: SDK 표준은 toolName, 일부 래퍼에서 type으로 노출될 수 있음
 *   - input / args:    AI SDK v5+ 표준은 input, 구버전은 args
 *   - output / result: AI SDK v5+ 표준은 output, 구버전은 result
 */
interface MinimalToolResult {
  toolName?: string;
  type?: string;
  /** AI SDK v5+ 입력 인수 */
  input?: unknown;
  /** AI SDK v4 이하 입력 인수 (하위 호환) */
  args?: unknown;
  /** AI SDK v5+ 실행 결과 */
  output?: unknown;
  /** AI SDK v4 이하 실행 결과 (하위 호환) */
  result?: unknown;
}

/**
 * collectToolResults가 실제로 접근하는 필드만 선언한 최소 Step 인터페이스.
 *
 * @description
 *   ReadonlyArray를 사용하는 이유: Vercel SDK의 streamText().steps는
 *   readonly 배열로 반환될 수 있으므로 T[] 대신 ReadonlyArray<T>로 양쪽 모두 수용합니다.
 */
interface MinimalStep {
  toolResults?: ReadonlyArray<MinimalToolResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * collectToolResults의 반환 타입.
 *
 * @param attachments tool 실행으로 생성된 파일 목록
 * @param metadata tool 호출 기록, 검색 결과 등 메타데이터
 */
export interface CollectedToolResults {
  attachments: Attachment[];
  metadata: {
    toolCalls: Array<{
      toolName: string;
      input: Record<string, unknown>;
      /** tool 결과 요약 (로깅 용도) */
      summary?: string;
    }>;
    searchResults?: WebSearchResult[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 값이 plain object(Record)인지 확인하는 타입 가드.
 * args/input 필드가 unknown으로 선언되어 있어 Record로 좁히는 데 사용합니다.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Collector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vercel AI SDK generateText / streamText의 steps 배열을 순회하여
 * tool 실행 결과를 Attachment[]와 metadata로 변환합니다.
 *
 * @param steps generateText() 또는 streamText()의 steps (tool 호출 기록 포함).
 *              ReadonlyArray<MinimalStep>을 수용하므로 SDK의 readonly steps와도 호환됩니다.
 * @returns 수집된 첨부파일과 메타데이터
 */
export function collectToolResults(steps: ReadonlyArray<MinimalStep>): CollectedToolResults {
  const attachments: Attachment[] = [];
  const toolCallMeta: CollectedToolResults['metadata']['toolCalls'] = [];
  const searchResults: WebSearchResult[] = [];

  for (const step of steps) {
    const results = step.toolResults ?? [];

    for (const tr of results) {
      const toolName: string = tr.toolName ?? tr.type ?? 'unknown';
      // input(v5+) → args(v4) 순으로 폴백. isPlainRecord 가드로 Record 타입으로 좁힘
      const rawArgs: unknown = tr.input ?? tr.args;
      const args: Record<string, unknown> = isPlainRecord(rawArgs) ? rawArgs : {};
      // output(v5+) → result(v4) 순으로 폴백. AI SDK v6에서 result가 output으로 변경됨
      const result: unknown = tr.output ?? tr.result;

      switch (toolName) {
        // ── 이미지 생성 ──────────────────────────────────────────
        case 'image_generation': {
          const imgResult = result as ImageGenerationResult | undefined;
          if (imgResult?.s3Key && !imgResult.error) {
            // revisedPrompt가 있으면 내용 기반 이름, 없으면 timestamp 폴백
            const baseName = imgResult.revisedPrompt
              ? imgResult.revisedPrompt.slice(0, 50).replace(/[^\w가-힣\s-]/g, '').trim().replace(/\s+/g, '_') || `generated-${Date.now()}`
              : `generated-image-${Date.now()}`;
            attachments.push({
              id: uuidv4(),
              type: 'image',
              url: imgResult.s3Key,
              name: `${baseName}.png`,
              mimeType: 'image/png',
              // S3 head-object 없이는 실제 크기 조회 불가.
              // FE: client.ai.downloadFile(url) → Blob.size 로 실제 크기 확인 가능.
              size: 0,
            });
            toolCallMeta.push({
              toolName,
              input: args,
              summary: `Image generated: ${imgResult.s3Key}${imgResult.revisedPrompt ? ` (revised prompt used)` : ''}`,
            });
          } else {
            toolCallMeta.push({
              toolName,
              input: args,
              summary: `Image generation failed: ${imgResult?.error ?? 'unknown'}`,
            });
          }
          break;
        }

        // ── 웹 검색 ──────────────────────────────────────────────
        case 'web_search': {
          const searchResult = result as { results?: WebSearchResult[]; error?: string } | undefined;
          if (searchResult?.results?.length) {
            searchResults.push(...searchResult.results);
          }
          toolCallMeta.push({
            toolName,
            input: args,
            summary: `Web search returned ${searchResult?.results?.length ?? 0} results${searchResult?.error ? ` (error: ${searchResult.error})` : ''}`,
          });
          break;
        }

        // ── 웹 스크래퍼 ──────────────────────────────────────────
        case 'web_scraper': {
          const scraperResult = result as { content?: string; error?: string } | undefined;
          toolCallMeta.push({
            toolName,
            input: args,
            summary: `Scraped ${scraperResult?.content?.length ?? 0} chars${scraperResult?.error ? ` (error: ${scraperResult.error})` : ''}`,
          });
          break;
        }

        default:
          toolCallMeta.push({ toolName, input: args });
      }
    }
  }

  return {
    attachments,
    metadata: {
      toolCalls: toolCallMeta,
      ...(searchResults.length > 0 ? { searchResults } : {}),
    },
  };
}
