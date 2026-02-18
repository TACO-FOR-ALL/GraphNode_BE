/**
 * 모듈: AiInteractionService (AI 채팅 서비스)
 *
 * 책임:
 * - AI 모델(OpenAI 등)과의 대화 로직을 조율합니다.
 * - 사용자의 메시지를 받아 AI에게 전달하고, 응답을 받아 저장합니다.
 * - ChatManagementService를 사용하여 대화 내용과 메시지를 관리합니다.
 *
 * 외부 의존:
 * - OpenAI SDK: 실제 AI 모델 호출
 */

import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/base';
import 'multer'; // Ensure Multer types are loaded
import { NotFoundError, UpstreamError, ValidationError, ForbiddenError } from '../../shared/errors/domain';
import { AIchatType } from '../../shared/ai-providers/AIchatType';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { AIChatResponseDto, ChatMessage, ChatThread } from '../../shared/dtos/ai';
import { getAiProvider, IAiProvider } from '../../shared/ai-providers/index';
import { ChatMessageRequest } from '../../shared/ai-providers/ChatMessageRequest';
import { loadEnv } from '../../config/env';
import { ApiKeyModel } from '../../shared/dtos/me';
import { Attachment } from '../../shared/dtos/ai';
import { StoragePort } from '../ports/StoragePort';
import { v4 as uuidv4 } from 'uuid';

import { Readable } from 'stream';

interface AiHandlerResponse {
  content: string;
  attachments?: Attachment[];
  metadata?: any;
}

export class AiInteractionService {
  // 생성자 주입을 통해 필요한 하위 서비스들을 의존성으로 받습니다.
  // 생성자 주입을 통해 필요한 하위 서비스들을 의존성으로 받습니다.
  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly userService: UserService,
    private readonly storageAdapter: StoragePort
  ) {}


  /**
   * API Key 검증
   * @param ownerUserId 사용자 ID
   * @param model 모델명
   * @returns API Key valid 여부
   * @throws ForbiddenError
   */
  async checkApiKey(ownerUserId: string, model: ApiKeyModel): Promise<boolean> {
    const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, model);
    const apiKey = apiKeyResponse.apiKey;

    if (!apiKey) {
      throw new ForbiddenError(
        `API Key for model ${model} not found. Please register it in settings.`
      );
    }

    // Provider 획득 (Factory Pattern)
    let provider: IAiProvider;
    try {
      provider = getAiProvider(model);
    } catch (e) {
      throw new ValidationError(`Unsupported AI model: ${model}`);
    }

    // API Key 검증
    const isValid = await provider.checkAPIKeyValid(apiKey);
    if (!isValid.ok) {
      throw new ValidationError(`Invalid API Key for ${model}: ${isValid.error}`);
    }

    return true;
  }



  /**
   * AI 챗 메시지를 처리하는 핵심 메서드 (files 매개변수 추가됨)
   */
  async handleAIChat(
    ownerUserId: string,
    // FIXME: [Model Option Expansion] Provider 내 세부 모델(gpt-4, claude-3 등) 선택 로직 추가 필요
    chatbody: AIchatType,
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      // 0. 파일 업로드 (S3 저장 및 첨부파일 메타데이터 생성)
      const attachments = await this.handleFiles(files);

      // 1. API Key 조회
      const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, chatbody.model);
      const apiKey = apiKeyResponse.apiKey;

      if (!apiKey) {
        throw new ForbiddenError(
          `API Key for model ${chatbody.model} not found. Please register it in settings.`
        );
      }

      // Provider 획득 (Factory Pattern)
      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
      }

      // 2. API Key 검증 (개발 환경에서는 스킵, 추후 삭제)
      if (process.env.NODE_ENV !== 'development') {
        const isValid = await provider.checkAPIKeyValid(apiKey);
        if (!isValid.ok) {
          throw new ValidationError(`Invalid API Key for ${chatbody.model}: ${isValid.error}`);
        }
      }

      // 3. 대화방 조회 또는 생성
      let conversation: ChatThread;
      let isNewConversation = false;
      let newTitle: string | null = null;

      try {
        conversation = await this.chatManagementService.getConversation(conversationId, ownerUserId);
      } catch (err) {
        if (err instanceof NotFoundError) {
          isNewConversation = true;
          // 제목 생성
          const titleRequest = await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent);
          newTitle = titleRequest.ok ? titleRequest.data : 'New Conversation';

          conversation = await this.chatManagementService.createConversation(
            ownerUserId,
            conversationId,
            newTitle
          );
        } else {
          throw err;
        }
      }

      let aiContent = '';
      let generatedAttachments: Attachment[] | undefined;
      let generatedMetadata: any | undefined;

      // --- OpenAI Responses API 분기 ---
      if (chatbody.model === 'openai') {
        const response = await this.handleOpenAIResponsesChat(
          ownerUserId,
          conversationId,
          apiKey,
          conversation,
          provider,
          chatbody,
          files,
          onStream
        ) as any; // Explicit cast as handleOpenAIResponsesChat returns any now
        
        aiContent = response.content;
        generatedAttachments = response.attachments;
        generatedMetadata = response.metadata;
      } else {
        // --- 기존 Chat Completion (Claude, Gemini, etc) ---
        aiContent = await this.handleStandardChat(
          conversation,
          chatbody,
          provider,
          apiKey,
          onStream
        );
      }

      if (!aiContent && !onStream) {
        throw new UpstreamError('AI response content is empty.');
      }

      // 7. 메시지 저장 (User & AI)
      const userMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          id: chatbody.id,
          role: 'user',
          content: chatbody.chatContent,
          attachments: attachments,
        }
      );

      const aiMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          role: 'assistant',
          content: aiContent,
          attachments: generatedAttachments,
          metadata: generatedMetadata,
        }
      );

      return {
        title: isNewConversation ? newTitle || conversation.title : undefined,
        messages: [userMessage, aiMessage],
      };

    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleAIChat failed', { cause: String(err) });
    }
  }



  /**
   * OpenAI Responses API 전용 처리 로직
   * - Thread 생성/조회, 파일 업로드, 메시지 추가, Run 실행, 스트리밍 처리
   */
  /**
   * OpenAPI Responses API 전용 처리 로직
   * - Context Chaining, 멀티모달 입력 처리
   */
  private async handleOpenAIResponsesChat(
    ownerUserId: string,
    conversationId: string,
    apiKey: string,
    conversation: ChatThread,
    provider: IAiProvider,
    chatbody: AIchatType,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AiHandlerResponse> {
    try {
        let aiContent = '';
        const generatedAttachments: Attachment[] = [];
        const metadata: any = { toolCalls: [] };

        // 1. 입력 컨텐츠 구성 (Text)
        const contentParts: any[] = [
            { type: 'input_text', text: chatbody.chatContent }
        ];

        const fileIdsForTools: string[] = [];

        // 파일 처리 (OpenAI Upload)
        if (files && files.length > 0) {
            for (const file of files) {
                if (file.mimetype.startsWith('image/')) {
                    // 이미지 처리: purpose='vision'
                    const uploadRes = await provider.uploadFile(apiKey, {
                        buffer: file.buffer,
                        filename: file.originalname,
                        mimetype: file.mimetype
                    }, 'vision');

                    if (uploadRes.ok) {
                        contentParts.push({
                            type: 'input_image', 
                            file_id: uploadRes.data.fileId,
                            detail: 'auto'
                        });
                    } else {
                         throw new UpstreamError(`Image upload to OpenAI failed: ${uploadRes.error}`);
                    }
                } else {
                    // 그 외 모든 문서/데이터 파일 -> 'assistants' purpose
                    const uploadRes = await provider.uploadFile(apiKey, {
                        buffer: file.buffer,
                        filename: file.filename,
                        mimetype: file.mimetype
                    }, 'assistants');

                    if (uploadRes.ok) {
                        fileIdsForTools.push(uploadRes.data.fileId);
                    } else {
                        throw new UpstreamError(`File upload failed: ${uploadRes.error}`);
                    }
                }
            }
        }

        // 2. Responses API 호출
        const lastResponseId = conversation.lastResponseId;
        
        // User Message 구성
        const inputMessage = {
            role: 'user',
            content: contentParts
        };
        
        // Tools 및 Tool Resources 구성
        const tools: any[] = [];

        if (fileIdsForTools.length > 0) {
            tools.push({ 
                type: 'code_interpreter',
                container: {
                    type: 'auto',
                    file_ids: fileIdsForTools
                }
            });
             // tools.push({ type: 'file_search' }); // Disabled per plan
        } else {
            // 파일이 없어도 코드 인터프리터 등은 기본적으로 활성화하고 싶다면 여기서 추가
            // tools.push({ type: 'code_interpreter' }); 
        }

        const res = await provider.createResponse(apiKey, {
            model: 'gpt-4o',
            input: [inputMessage],
            tools: tools.length > 0 ? tools : undefined,
            previous_response_id: lastResponseId,
            store: true 
        });

        if (!res.ok) {
            throw new UpstreamError(`Responses API failed: ${res.error}`);
        }

        // 3. 스트리밍 처리 및 Response ID 캡처
        let newResponseId: string | undefined;

        for await (const chunk of res.data) {
            const eventType = (chunk as any).type;

            // 1. 에러 이벤트 처리
            if (eventType === 'response.error') {
                const error = (chunk as any).error;
                logger.error({ 
                    error, 
                    conversationId, 
                    lastResponseId: newResponseId 
                }, 'OpenAI Responses API stream error event received');
                
                throw new UpstreamError(
                    `OpenAI streaming error: ${error.message || 'Unknown error'}`,
                    { cause: error }
                );
            }

            if (eventType === 'response.created') {
                 newResponseId = (chunk as any).response?.id;
                 logger.info({ newResponseId, conversationId }, 'OpenAI Response created');
            }
            
            // 2. 텍스트 델타 처리
            if (eventType === 'response.output_text.delta') {
                 const delta = (chunk as any).delta;
                 if (delta) {
                     aiContent += delta;
                     onStream?.(delta);
                 }
            }
            
            // 3. 완료된 항목 처리 (이미지, 도구 출력 등)
            if (eventType === 'response.output_item.done') {
                const item = (chunk as any).item;
                
                // (1) 메시지 아이템 (이미지 포함 가능)
                if (item.type === 'message') {
                     for (const content of item.content) {
                         if (content.type === 'image_file') {
                             const fileId = content.image_file.file_id;
                             try {
                                 const attachment = await this.processGeneratedFile(fileId, apiKey, provider);
                                 generatedAttachments.push(attachment);
                                 logger.info({ fileId, attachmentId: attachment.id }, 'Generated image processed');
                             } catch (e) {
                                 logger.error({ err: e, fileId }, 'Failed to process generated image');
                             }
                         }
                         // 텍스트는 delta로 이미 처리됨
                     }
                }

                // (2) 코드 인터프리터 호출
                if (item.type === 'code_interpreter_call') {
                     const callData = {
                         type: 'code_interpreter',
                         input: item.code_interpreter_call.code,
                         outputs: item.code_interpreter_call.outputs, // logs, images
                         logs: '' // 단순화된 로그 수집용
                     };

                     // Outputs 처리 (로그 수집 및 이미지 추출)
                     if (Array.isArray(callData.outputs)) {
                         for (const output of callData.outputs) {
                             if (output.type === 'logs') {
                                 callData.logs += output.logs + '\n';
                             }
                             if (output.type === 'image') {
                                 const fileId = output.image.file_id;
                                 try {
                                     const attachment = await this.processGeneratedFile(fileId, apiKey, provider);
                                     generatedAttachments.push(attachment);
                                      logger.info({ fileId, attachmentId: attachment.id }, 'Code interpreter generated image processed');
                                 } catch (e) {
                                     logger.error({ err: e, fileId }, 'Failed to process code interpreter image');
                                 }
                             }
                         }
                     }
                     metadata.toolCalls.push(callData);
                }
                
                // (3) 파일 검색 호출 (추후 확장)
                if (item.type === 'file_search_call') {
                    metadata.toolCalls.push({
                        type: 'file_search',
                        input: item.file_search_call.query,
                        citations: item.file_search_call.results // 포함되었는지 확인 필요 (include에 file_search_call.results 추가해야 함)
                    });
                }
            }

            if (eventType === 'response.completed') {
                const finalId = (chunk as any).response?.id;
                if (finalId) newResponseId = finalId;
                logger.info({ 
                    finalId, 
                    conversationId, 
                    contentLength: aiContent.length,
                    attachmentsCount: generatedAttachments.length
                }, 'OpenAI Response completed successfully');
            }
        }

        // 4. 마지막 Response ID 저장 (Context Chaining)
        if (newResponseId) {
            await this.chatManagementService.updateDocWithAuth(conversationId, ownerUserId, {
                lastResponseId: newResponseId
            });
        }
        
        // 5. 생성된 메타데이터 및 첨부파일을 AI Interaction 결과에 포함시키기 위해 Return 값이 아닌
        //    createMessage 호출 시점에 주입해야 하므로, 부모 메서드(handleAIChat)에서 이를 처리하기 어렵습니다.
        //    (handleOpenAIResponsesChat은 string만 반환하므로)
        //    따라서 여기서 message update 혹은 createMessage를 직접 호출하거나, 
        //    Return Type을 변경해야 합니다. 
        //    기존 handleStandardChat과의 호환성을 위해, 여기서는 handleAIChat이 
        //    string 반환을 기대하므로, 꼼수로 부모에게 데이터를 전달하거나
        //    설계상 handleOpenAIResponsesChat이 직접 저장을 수행하지 않는다면,
        //    Return Type을 { content: string, attachments: Attachment[], metadata: any } 로 변경하는 것이 옳습니다.
        
        //    [FIX] handleAIChat을 수정하여 객체를 반환하도록 변경하겠습니다.
        //    하지만 interface 변경이 크므로, 여기서는 throw를 통해 data를 전달하거나,
        //    혹은 객체를 리턴하고 handleAIChat에서 타입 체크를 하는 방식을 쓰겠습니다.
        
        //    일단은 string만 반환하는 구조이므로, generatedAttachments를 어딘가에 저장해야 합니다.
        //    가장 좋은 방법은 handleAIChat에서 이 메서드의 리턴 타입을 확장하는 것입니다.
        //    그러나 `handleStandardChat`은 string만 반환합니다.
        
        //    [Decision] handleOpenAIResponsesChat의 리턴 타입을 any로 바꾸고 handleAIChat에서 처리.
        return { content: aiContent, attachments: generatedAttachments, metadata } as any;

    } catch (err: unknown) {
        logger.error({ err, conversationId, ownerUserId }, 'handleOpenAIResponsesChat failed');
        if (err instanceof AppError) throw err;
        throw new UpstreamError('handleOpenAIResponsesChat failed', { cause: String(err) });
    }
  }

  /**
   * OpenAI 생성 파일 처리 (다운로드 -> S3 업로드 -> Attachment 생성)
   */
  private async processGeneratedFile(fileId: string, apiKey: string, provider: IAiProvider): Promise<Attachment> {
      if (!provider.downloadFile) {
          throw new UpstreamError('Provider does not support file download');
      }

      const downloadRes = await provider.downloadFile(apiKey, fileId);
      if (!downloadRes.ok) {
          throw new UpstreamError(`Failed to download generated file ${fileId}: ${downloadRes.error}`);
      }
      
      const { buffer, filename, mimeType } = downloadRes.data;
      const safeFilename = filename || `generated_${fileId}.bin`;
      const key = `chat-attachments/${uuidv4()}/${safeFilename}`;
      
      // S3 업로드
      await this.storageAdapter.upload(key, buffer, mimeType || 'application/octet-stream', { bucketType: 'file' });
      
      return {
          id: uuidv4(),
          type: (mimeType && mimeType.startsWith('image/')) ? 'image' : 'file',
          url: key, // Public URL 로직 필요 시 수정
          name: safeFilename,
          mimeType: mimeType || 'application/octet-stream',
          size: buffer.length
      };
  }

  /**
   * 표준 Chat Completion API 처리 로직 (Claude, Gemini, DeepSeek 등)
   */
  private async handleStandardChat(
    conversation: ChatThread,
    chatbody: AIchatType,
    provider: IAiProvider,
    apiKey: string,
    onStream?: (chunk: string) => void
  ): Promise<string> {
    const history: ChatMessage[] = conversation.messages || [];
    const messagesToSend = this.toChatMessageRequest(history);
    messagesToSend.push({ role: 'user', content: chatbody.chatContent });

    let detailedModelName = '';
    switch (chatbody.model) {
        case 'deepseek': detailedModelName = 'deepseek-chat'; break;
        case 'claude': detailedModelName = 'claude-3-haiku-20240307'; break;
        case 'gemini': detailedModelName = 'gemini-pro'; break;
        default: detailedModelName = chatbody.model;
    }

    let aiContent = '';

    if (onStream) {
        const aiResponse = await provider.requestStream(apiKey, detailedModelName, messagesToSend);
        if (!aiResponse.ok) throw new UpstreamError(`AI Request failed: ${aiResponse.error}`);
        for await (const chunk of aiResponse.data) {
            const delta = (chunk as any).choices?.[0]?.delta?.content ?? '';
            if (delta) {
                aiContent += delta;
                onStream(delta);
            }
        }
    } else {
         const aiRep = await provider.requestWithoutStream(apiKey, detailedModelName, messagesToSend);
         if (!aiRep.ok) throw new UpstreamError(aiRep.error);
         aiContent = (aiRep.data as any).choices?.[0]?.message?.content ?? '';
    }
    return aiContent;
  }

  /**
   * 파일 다운로드
   * @param key 파일 키
   * @returns 파일 스트림
   */
  async downloadFile(key: string): Promise<Readable> {
    return this.storageAdapter.downloadStream(key, { bucketType: 'file' });
  }

  /**
   * 파일 처리
   * @param files 파일 목록
   * @returns 파일 첨부파일 목록
   */
  private async handleFiles(files?: Express.Multer.File[]): Promise<Attachment[]> {
    if (!files || files.length === 0) return [];

    const attachments: Attachment[] = [];
    for (const file of files) {
      const key = `chat-files/${uuidv4()}-${file.originalname}`;
      // S3 File Bucket에 업로드
      await this.storageAdapter.upload(key, file.buffer, file.mimetype, { bucketType: 'file' });

      // TODO: Public URL 생성 방식 (현재는 단순 Key 또는 가정된 URL)
      const url = `${key}`;

      attachments.push({
        id: uuidv4(),
        type: file.mimetype.startsWith('image/') ? 'image' : 'file',
        url: url,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    }
    return attachments;
  }

  /**
   * 채팅 메시지를 ChatMessageRequest로 변환
   * @param messages 채팅 메시지 목록
   * @returns ChatMessageRequest 목록
   */
  private toChatMessageRequest(messages: ChatMessage[]): ChatMessageRequest[] {
    return messages.map((m) => {
      // 텍스트 내용
      let content: ChatMessageRequest['content'] = m.content;

      // 첨부파일(이미지)이 있다면 멀티모달 포맷으로 변환
      if (m.attachments && m.attachments.length > 0) {
        const imageAttachments = m.attachments.filter((a) => a.type === 'image');
        if (imageAttachments.length > 0) {
          content = [
            { type: 'text', text: m.content },
            ...imageAttachments.map((a) => ({
              type: 'image_url',
              image_url: { url: a.url }, // 주의: OpenAI는 퍼블릭 URL만 접근 가능 (로컬 테스트 시 주의)
            })),
          ];
        }
      }

      return {
        role: m.role,
        content: content,
      };
    });
  }
}

