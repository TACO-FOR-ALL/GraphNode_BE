/**
 * 모듈: Provider 공통 Tool 결과 수집 헬퍼
 *
 * 책임:
 * - Vercel AI SDK generateText() 결과의 steps[]를 순회하여
 *   tool 실행 결과(이미지 S3 키, 검색 링크 등)를 Attachment / metadata로 변환합니다.
 * - openai / claude / gemini Provider 구현체가 공통으로 사용합니다.
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
 *   Vercel AI SDK의 TypedToolResult<TOOLS>는 아래 유니온입니다:
 *     StaticToolResult (toolName, args: INPUT, result: OUTPUT)
 *   | DynamicToolResult (toolName?: string, input: unknown, result?: unknown)
 *
 *   호환 조건:
 *   - args/input 모두 `unknown`으로 선언 → DynamicToolResult.input: unknown 수용
 *   - result  optional + unknown → DynamicToolResult에 result 필드 없음 수용
 *   실제 값 추출은 루프 내부에서 isPlainRecord() 타입 가드로 안전하게 처리합니다.
 *
 *   필드명 alias 처리:
 *   - toolName / type: Vercel SDK 표준은 toolName, 일부 래퍼에서 type으로 노출될 수 있음
 *   - args / input:    Vercel SDK 표준은 args, DynamicToolResult는 input 사용
 */
interface MinimalToolResult {
  toolName?: string;
  type?: string;
  /** StaticToolResult의 입력 인수 (Record) */
  args?: unknown;
  /** DynamicToolResult의 입력 인수 (unknown) */
  input?: unknown;
  /** optional: DynamicToolResult에는 result 필드가 존재하지 않음 */
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
      // args/input 모두 unknown이므로 isPlainRecord 가드로 Record 타입으로 좁힘
      const rawArgs: unknown = tr.args ?? tr.input;
      const args: Record<string, unknown> = isPlainRecord(rawArgs) ? rawArgs : {};
      // unknown으로 유지 — 케이스별 단일 캐스팅(as T)으로 이중 캐스팅 제거
      const result: unknown = tr.result;

      switch (toolName) {
        // ── 이미지 생성 ──────────────────────────────────────────
        case 'image_generation': {
          // tools.ts의 execute()가 항상 ImageGenerationResult를 반환하므로 단일 캐스팅 안전
          const imgResult = result as ImageGenerationResult;
          if (imgResult.s3Key && !imgResult.error) {
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
              summary: `Image generation failed: ${imgResult.error ?? 'unknown'}`,
            });
          }
          break;
        }

        // ── 웹 검색 ──────────────────────────────────────────────
        case 'web_search': {
          const searchResult = result as { results?: WebSearchResult[]; error?: string };
          if (searchResult.results?.length) {
            searchResults.push(...searchResult.results);
          }
          toolCallMeta.push({
            toolName,
            input: args,
            summary: `Web search returned ${searchResult.results?.length ?? 0} results${searchResult.error ? ` (error: ${searchResult.error})` : ''}`,
          });
          break;
        }

        // ── 웹 스크래퍼 ──────────────────────────────────────────
        case 'web_scraper': {
          const scraperResult = result as { content?: string; error?: string };
          toolCallMeta.push({
            toolName,
            input: args,
            summary: `Scraped ${scraperResult.content?.length ?? 0} chars${scraperResult.error ? ` (error: ${scraperResult.error})` : ''}`,
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
