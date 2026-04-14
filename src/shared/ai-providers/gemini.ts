import { GoogleGenAI } from '@google/genai';
import { Readable } from 'stream';

import { IAiProvider, Result, AiResponse, ChatGenerationParams } from './IAiProvider';
import { StoragePort } from '../../core/ports/StoragePort';
import { documentProcessor } from '../utils/documentProcessor';
import { logger } from '../../shared/utils/logger';

/**
 * Gemini API의 원시 에러를 시스템에서 사용하는 표준 에러 코드로 변환합니다.
 */
function normalizeError(e: any): string {
  const msg = e.message || '';
  const status = e.status || (e.response?.status);
  
  logger.error({ 
    err: e, 
    message: msg, 
    status,
    stack: e.stack,
    details: e.details || e.response?.data?.error?.details
  }, 'Gemini Provider Error caught');

  if (msg.includes('API key not valid')) return 'unauthorized_key';
  if (msg.includes('Location not supported')) return 'unsupported_location';
  if (status === 401) return 'unauthorized_key';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'model_not_found';
  if (msg.includes('PERMISSION_DENIED')) return 'forbidden';
  if (msg.includes('UNAUTHENTICATED')) return 'unauthorized_key';
  if (msg.includes('RESOURCE_EXHAUSTED')||status === 429)
  {
    if (msg.includes('billing') ||msg.includes('payment') ||msg.includes('not enabled') ||msg.includes('free tier')
    ) 
    {
      return 'insufficient_credit';
    }
    return 'rate_limited';
  }
  

  if (msg.includes('INVALID_ARGUMENT')) return 'bad_request';

  return 'unknown_error';
}

/**
 * 스트림 데이터를 버퍼로 변환합니다.
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Gemini (@google/genai) AI Provider 구현체
 */
export const geminiProvider: IAiProvider = {
  /**
   * API 키 유효성을 검증합니다.
   */
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    if (!apiKey || apiKey.trim().length === 0) {
      return { ok: false, error: 'empty_api_key' };
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Hi'
      });
      return { ok: true, data: true };
    } catch (e: any) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * 대화를 생성하고 선택적으로 스트리밍 응답을 제공합니다.
   */
  async generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>> {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let systemInstruction: string | undefined;
      const contents: any[] = [];

      const rawMessages = params.messages;
      
      // 시스템 지시문 추출
      const systemMsg = rawMessages.find(m => m.role === 'system');
      if (systemMsg) {
          systemInstruction = typeof systemMsg.content === 'string' 
            ? systemMsg.content 
            : "";
      }

      const chatMessages = rawMessages.filter(m => m.role !== 'system');
      
      if (chatMessages.length === 0) {
          return { ok: false, error: 'no_user_message' };
      }

      // 메시지 이력 구성
      for (const m of chatMessages) {
          const parts: any[] = [];

          if (m.content && typeof m.content === 'string') {
              parts.push({ text: m.content });
          }

          // 첨부파일 처리
          if (m.attachments && m.attachments.length > 0 && storageAdapter) {
              for (const att of m.attachments) {
                  try {
                       const stream = await storageAdapter.downloadStream(att.url, { bucketType: 'file' });
                       const buffer = await streamToBuffer(stream as Readable);
                       const processed = await documentProcessor.process(buffer, att.mimeType, att.name);
                       
                       if (processed.type === 'text') {
                           parts.push({ text: processed.content });
                       } else if (processed.type === 'image') {
                           parts.push({
                               inlineData: {
                                   mimeType: att.mimeType,
                                   data: processed.content
                               }
                           });
                       }
                  } catch (e) {
                       logger.error({ err: e, fileKey: att.url }, `Failed to process attachment ${att.id} for gemini`);
                  }
              }
          }
          
          if (parts.length > 0) {
              contents.push({
                  role: m.role === 'assistant' ? 'model' : 'user',
                  parts: parts
              });
          }
      }

      // 스트리밍 호출
      const streamResponse = await ai.models.generateContentStream({
        model: params.model || 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          maxOutputTokens: 4096
        }
      });

      let fullContent = '';
      for await (const chunk of streamResponse) {
        const delta = chunk.text || '';
        if (delta) {
          fullContent += delta;
          onStream?.(delta);
        }
      }

      return {
        ok: true,
        data: {
          content: fullContent,
          attachments: [],
          metadata: {}
        }
      };

    } catch (e: any) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * 대화 요약(제목)을 생성합니다.
   */
  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number; language?: string }
  ): Promise<Result<string>> {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const languageInstruction = opts?.language 
        ? ` The title MUST be in ${opts.language}.`
        : '';
      const prompt = `Generate a thread title based on the message below in 20 letters or less.${languageInstruction} Return ONLY the JSON object {"title": "..."}. Message: "${firstUserMessage}"`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      
      // response.text property (Gen AI 2.0 pattern)
      const text = (response as any).text || '';
      try {
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const { title } = JSON.parse(jsonStr);
        if (title) return { ok: true, data: title };
      } catch {}
      return { ok: true, data: firstUserMessage.slice(0, 15) };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },
};

export default geminiProvider;
