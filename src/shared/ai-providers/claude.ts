import Anthropic from '@anthropic-ai/sdk';
import { Readable } from 'stream';
import { IAiProvider, Result, AiResponse, ChatGenerationParams } from './IAiProvider';
import { StoragePort } from '../../core/ports/StoragePort';
import { documentProcessor } from '../utils/documentProcessor';
import { logger } from '../../shared/utils/logger';

function normalizeError(e: any): string {
  // Anthropic Error Mapping
  const msg = e.message || '';
  if (e instanceof Anthropic.AuthenticationError || msg.includes('401')) return 'unauthorized_key';
  if (e instanceof Anthropic.RateLimitError || msg.includes('429')) return 'rate_limited';
  if (e instanceof Anthropic.NotFoundError || msg.includes('404')) return 'not_found';
  if (e instanceof Anthropic.BadRequestError || msg.includes('400')) return 'bad_request';
  if (e instanceof Anthropic.APIConnectionError) return 'connection_error';
  if (e instanceof Anthropic.APIError || msg.includes('500')) return 'server_error';
  return 'unknown_error';
}

/**
 * 스트림을 버퍼로 변환하는 헬퍼 함수
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

export const claudeProvider: IAiProvider = {
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    try {
      const client = new Anthropic({ apiKey });
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

  /**
   * 통합 채팅 생성 메서드 (Stateless)
   * @param apiKey Anthropic API 키
   * @param params 채팅 생성 파라미터
   * @param onStream 스트리밍 이벤트 핸들러
   * @param storageAdapter 파일 저장 어댑터
   * @returns AI 응답
   */
  async generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>> {
    try {
      const client = new Anthropic({ apiKey });

      // 1. 시스템 메시지 추출 & 메시지 변환
      let systemMessage: string | undefined;
      const messages: Anthropic.MessageParam[] = [];

      // 메시지 변환
      for (const m of params.messages) {

        // 시스템 메시지
        if (m.role === 'system') {
          // System message is strictly a string in ChatMessageRequest usually, 
          // but if it's array, we join text.
          if (Array.isArray(m.content)) {
             // @ts-ignore
             systemMessage = m.content.map(c => c.text || '').join('\n');
          } else {
             systemMessage = m.content as string;
          }
        } 
        else {
           // User/Assistant messages
           const contentParts: Anthropic.ContentBlockParam[] = [];
           
           // 1. Text Content 추출
           if (m.content) {
               if (typeof m.content === 'string') {
                   contentParts.push({ type: 'text', text: m.content });
               } else if (Array.isArray(m.content)) {
                    // Legacy array support
                   // @ts-ignore
                   m.content.forEach(c => {
                       if (c.type === 'text') contentParts.push({ type: 'text', text: c.text });
                   });
               }
           }

           // 2. Attachments (File Handling) 추출 처리
           if (m.attachments && m.attachments.length > 0 && storageAdapter) {
               for (const att of m.attachments) {
                   try {

                        // 파일 다운로드
                        const stream = await storageAdapter.downloadStream(att.url, { bucketType: 'file' });
                        const buffer = await streamToBuffer(stream as Readable);
                        
                        // DocumentProcessor processing
                        const processed = await documentProcessor.process(buffer, att.mimeType, att.name);
                        
                        if (processed.type === 'text') {
                            contentParts.push({ type: 'text', text: processed.content });
                        } 
                        else if (processed.type === 'image') {
                            // Claude expects Base64 for images
                            contentParts.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: att.mimeType as any, // e.g. "image/jpeg"
                                    data: processed.content // base64 string
                                }
                            });
                        }
                   } catch (e) {
                       logger.error({ err: e, fileKey: att.url }, `Failed to process attachment ${att.id} for claude`);
                   }
               }
           }
           
           // 메시지 추가
           messages.push({
               role: m.role as 'user' | 'assistant',
               content: contentParts.length > 0 ? contentParts : ([{ type: 'text', text: '' }] as any)
           });
        }
      }

      const modelName : string = params.model || 'claude-3-haiku-20240307';

      // 2. 스트리밍 요청 using SDK helper
      const stream = client.messages.stream({
        model: modelName,
        max_tokens: 4096,
        system: systemMessage,
        messages: messages,
      });

      let fullContent = '';

      // 3. 스트림 이벤트 핸들링 (SDK Helper 활용)
      stream.on('text', (textDelta) => {
        fullContent += textDelta;
        onStream?.(textDelta);
      });

      // 4. 최종 응답
      const finalMessage = await stream.finalMessage();
      
      // Usage info could be extracted from finalMessage.usage

      return {
        ok: true,
        data: {
          content: fullContent,
          attachments: [], // Claude attachments not yet implemented
          metadata: {
              id: finalMessage.id,
              usage: finalMessage.usage
          }
        }
      };

    } catch (e: any) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  // --- Legacy Methods (Deprecated) ---
  
  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>> {
    try {
      const prompt = `You are a helpful assistant. Generate a thread title based on the message below in 20 letters or less. Return ONLY the JSON object {"title": "..."}. Message: "${firstUserMessage}"`;
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      try {
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const { title } = JSON.parse(jsonStr);
        if (title) return { ok: true, data: title };
      } catch {}
      const fallback = firstUserMessage.slice(0, 15) + (firstUserMessage.length > 15 ? '…' : '');
      return { ok: true, data: fallback };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  },
};
