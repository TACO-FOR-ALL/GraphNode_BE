import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { Readable } from 'stream';

import { IAiProvider, Result, AiResponse, ChatGenerationParams } from './IAiProvider';
import { StoragePort } from '../../core/ports/StoragePort';
import { documentProcessor } from '../utils/documentProcessor';
import { logger } from '../../shared/utils/logger';

function normalizeError(e: any): string {
  // GoogleGenerativeAI Error Mapping (간소화)
  const msg = e.message || '';
  if (msg.includes('API key not valid')) return 'unauthorized_key';
  if (msg.includes('429')) return 'rate_limited';
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

export const geminiProvider: IAiProvider = {
  async checkAPIKeyValid(apiKey: string): Promise<Result<true>> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' }); // or gemini-1.5-flash
      await model.generateContent('Hi');
      return { ok: true, data: true };
    } catch (e: any) {
      return { ok: false, error: normalizeError(e) };
    }
  },

  /**
   * 통합 채팅 생성 메서드 (Stateless)
   */
  async generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // 1. System Instruction 추출
      let systemInstruction: string | undefined;
      const history: Content[] = [];
      let lastUserMessageParts: Part[] = [];

      // History mapping
      const rawMessages = params.messages;
      
      // Extract System
      const systemMsg = rawMessages.find(m => m.role === 'system');
      if (systemMsg) {
          if (Array.isArray(systemMsg.content)) {
            // @ts-ignore - content type mismatch handling
              systemInstruction = systemMsg.content.map(c => c.text).join('\n');
          } else {
              systemInstruction = systemMsg.content as string;
          }
      }

      // Filter non-system messages
      const chatMessages = rawMessages.filter(m => m.role !== 'system');
      
      if (chatMessages.length === 0) {
          return { ok: false, error: 'no_user_message' };
      }

      // Process all messages to build history and last message
      // Gemini expects history + last message prompt separately for sendMessageStream
      // But we can iterate all, pop the last one, or just build them.
      
      // Let's build ALL contents first, then separate last one.
      const allContents: Content[] = [];

      for (const m of chatMessages) {
          const parts: Part[] = [];

          // 1. Text Content
          if (m.content) {
               if (typeof m.content === 'string') {
                   parts.push({ text: m.content });
               }
          }

          // 2. Attachments (File Handling)
          if (m.attachments && m.attachments.length > 0 && storageAdapter) {
              for (const att of m.attachments) {
                  try {
                       const stream = await storageAdapter.downloadStream(att.url, { bucketType: 'file' });
                       const buffer = await streamToBuffer(stream as Readable);
                       
                       // DocumentProcessor processing
                       const processed = await documentProcessor.process(buffer, att.mimeType, att.name);
                       
                       if (processed.type === 'text') {
                           // Text/Code/PDF/Doc -> Text Part
                           parts.push({ text: processed.content });
                       } else if (processed.type === 'image') {
                           // Image -> Inline Data
                           parts.push({
                               inlineData: {
                                   mimeType: att.mimeType,
                                   data: processed.content // base64
                               }
                           });
                       }
                  } catch (e) {
                      logger.error({ err: e, fileKey: att.url }, `Failed to process attachment ${att.id} for gemini`);
                  }
              }
          }
          
          if (parts.length > 0) {
              allContents.push({
                  role: m.role === 'assistant' ? 'model' : 'user',
                  parts: parts
              });
          }
      }

      // 이전 대화 기록 + 마지막 메시지가 다 없음
      if (allContents.length === 0) return { ok: false, error: 'empty_context' };

      // Separate History vs Last Message
      const lastContent = allContents[allContents.length - 1];
      const historyContents = allContents.slice(0, -1);
      
      // Check if last message is from user (Gemini requirement: prompt must be user?)
      // Actually sendMessageStream takes (prompt).
      // If last message is 'model', we might have an issue, but standard chat flow ends with user.
      
      const model = genAI.getGenerativeModel({ 
          model: params.model || 'gemini-pro',
          systemInstruction: systemInstruction 
      });

      const chat = model.startChat({
        history: historyContents,
        generationConfig: { maxOutputTokens: 4096 },
      });

      
      const result = await chat.sendMessageStream(lastContent.parts);

      // LLM 답변을 받는 부분
      let fullContent = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullContent += chunkText;
        onStream?.(chunkText);
      }

      // return
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

  // --- Legacy Methods (Deprecated) ---

  async requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Generate a thread title based on the message below in 20 letters or less. Return ONLY the JSON object {"title": "..."}. Message: "${firstUserMessage}"`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
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
