import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

import { ChatMessage, Attachment } from '../dtos/ai';
import { logger } from '../../shared/utils/logger';
import { IAiProvider, Result, AiResponse, ChatGenerationParams } from './IAiProvider';
import { StoragePort } from '../../core/ports/StoragePort';
import { documentProcessor } from '../utils/documentProcessor';

/**
 * 오류 객체를 정규화하여 문자열로 반환합니다.
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
}

/**
 * 스트림을 버퍼로 변환하는 헬퍼 함수
 * @param stream 변환할 스트림
 * @returns 버퍼 
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export const openAI: IAiProvider = {
  /**
   * OPENAI API Key 유효성 검사
   * @param apiKey OpenAI API Key
   * @returns 유효성 검사 결과
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
  },

  /**
   * 통합 채팅 생성 메서드 (Stateless & Chat Completions API)
   * - 매 요청마다 S3에서 이미지/파일을 다운로드하여 OpenAI에 주입합니다.
   * - 이미지는 Base64로 변환하여 payload에 포함시킵니다.
   * @param apiKey OpenAI API Key
   * @param params 채팅 생성 파라미터
   * @param onStream 스트리밍 콜백
   * @param storageAdapter 스토리지 어댑터
   * @returns 채팅 생성 결과
   */
  async generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>> {
    const msgCount = params.messages.length;
    logger.info({ model: params.model, msgCount }, 'openAI.generateChat called');

    if (!storageAdapter) {
        logger.warn('StorageAdapter is not provided to OpenAI provider. Attachments cannot be processed.');
    }

    try {

      // OpenAI Client 생성
      const client = new OpenAI({ apiKey, timeout: 600000 });

      // 1. 메시지 매핑 (ChatMessage -> OpenAI Input)
      const openAiMessages: any[] = [];

      // Message 기록에 대한 루프 처리
      for (const msg of params.messages) {
        const role = msg.role; // 'user' | 'assistant' | 'system'
        const contentParts: any[] = [];

        // 1-1. 개별 메세지의 텍스트 처리
        if (msg.content) {
             if (typeof msg.content === 'string') {
                 contentParts.push({ type: 'text', text: msg.content });
             }             
        }

        // 1-2. 첨부파일 처리 (Unified Document Processor)
        if (msg.attachments && msg.attachments.length > 0 && storageAdapter) {
            for (const att of msg.attachments) {
                try {
                    // S3에서 파일 다운로드 (Stream -> Buffer)
                    const stream = await storageAdapter.downloadStream(att.url, { bucketType: 'file' });
                    const buffer = await streamToBuffer(stream as Readable);
                    
                    // DocumentProcessor로 처리 (이미지/텍스트/코드/문서 등)
                    const processed = await documentProcessor.process(buffer, att.mimeType, att.name);
                    
                    if (processed.type === 'image') {
                        // 이미지: Base64 URL로 추가
                        contentParts.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${att.mimeType};base64,${processed.content}`
                            }
                        });
                    } else if (processed.type === 'text') {
                        // 텍스트/문서: 텍스트 컨텐츠로 추가
                        contentParts.push({
                            type: 'text',
                            text: processed.content
                        });
                    }
                } catch (e) {
                    // 처리 실패 시 에러 로그 남기고 해당 파일만 건너뜀
                    logger.error({ err: e, fileKey: att.url, fileName: att.name }, 
                        `Failed to process attachment ${att.id} for chat`);
                }
            }
        }
        
        // OpenAI 포맷에 맞게 Push
        // content가 비어있으면(이미지도 없고 텍스트도 없으면) 에러나므로 체크
        if (contentParts.length > 0) {
            openAiMessages.push({ role, content: contentParts });
        }
      }

      // 모델 Fallback
      const targetModel = params.model || 'gpt-4o-mini';

      // 2. Chat Completions API 호출
      const stream = await client.chat.completions.create({
        model: targetModel,
        messages: openAiMessages,
        stream: true,
        // tools: params.tools // 도구 사용 시 주석 해제
      });

      let aiContent = '';
      const generatedAttachments: Attachment[] = []; // Chat Completions는 파일 생성을 직접 하지 않음 (달리/Code Interpreter 제외)
      const metadata: any = {};

      // 3. 스트림 처리
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
            aiContent += delta;
            onStream?.(delta);
        }
        // Tool Calls 처리 로직은 복잡하므로 필요 시 추가
      }

      return {
        ok: true,
        data: {
          content: aiContent,
          attachments: generatedAttachments,
          metadata
        }
      };

    } catch (e: any) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.generateChat failed');
      return { ok: false, error: errorMsg };
    }
  },
  
  /**
   * 사용자 메시지 기반으로 스레드 제목 생성
   */
  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>> {
    try {
      const client = new OpenAI({ apiKey, timeout: opts?.timeoutMs || 10000 });
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Generate a short, concise title (max 5 words) for a chat thread starting with this message. Return a JSON object with a "title" field.' },
          { role: 'user', content: firstUserMessage },
        ],
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return { ok: true, data: 'New Conversation' };

      try {
        const parsed = JSON.parse(content);
        return { ok: true, data: parsed.title || 'New Conversation' };
      } catch {
        return { ok: true, data: 'New Conversation' };
      }
    } catch (e) {
      return { ok: true, data: 'New Conversation' }; // Fail gracefully
    }
  },

  /**
   * 파일 업로드
   * - Chat Completions API에서는 파일 업로드가 필수적이지 않음 (이미지는 Base64 전송).
   * - 다만 Fine-tuning이나 Assistants API 혼용 시 필요할 수 있으므로 유지하되, JSDoc 보강.
   * 
   * @param apiKey OpenAI API Key
   * @param file 업로드할 파일 객체 (Buffer, Filename, MimeType)
   * @param purpose 업로드 목적 ('assistants' | 'vision' | 'fine-tune' 등)
   */
  async uploadFile(
    apiKey: string, 
    file: { buffer: Buffer; filename: string; mimetype: string },
    purpose: 'assistants' | 'vision' | 'assistants'
  ): Promise<Result<{ fileId: string }>> {
    try {
      const client = new OpenAI({ apiKey });
      const fileObj = await import('openai/uploads').then((m) =>
        m.toFile(file.buffer, file.filename, { type: file.mimetype })
      );
      
      const response = await client.files.create({
        file: fileObj,
        purpose: purpose as any,
      });
      return { ok: true, data: { fileId: response.id } };
    } catch (e) {
      const errorMsg = normalizeError(e);
      logger.error({ err: e, errorMsg }, 'openAI.uploadFile failed');
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * 파일 다운로드
   * @deprecated Chat Completions API는 Stateless이므로 OpenAI에서 파일을 다운로드할 일이 거의 없습니다.
   * (Code Interpreter 결과물 등은 예외지만, 현재 구조에서는 사용되지 않음)
   */
  async downloadFile(apiKey: string, fileId: string): Promise<Result<{ buffer: Buffer; filename?: string; mimeType?: string }>> {
    logger.warn('openAI.downloadFile is deprecated and should not be used in Stateless Chat flow.');
    return { ok: false, error: 'deprecated_method' };
  }
};

export default openAI;
