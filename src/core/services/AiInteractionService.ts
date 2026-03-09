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

import 'multer'; // Ensure Multer types are loaded
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

import { AppError } from '../../shared/errors/base';
import { NotFoundError, UpstreamError, ValidationError, ForbiddenError } from '../../shared/errors/domain';
import { AIchatType } from '../../shared/ai-providers/AIchatType';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { AIChatResponseDto, ChatMessage, ChatThread, Attachment } from '../../shared/dtos/ai';
import { AiResponse, getAiProvider, IAiProvider, Result } from '../../shared/ai-providers/index';
import { ApiKeyModel } from '../../shared/dtos/me';
import { StoragePort } from '../ports/StoragePort';
import { withRetry } from '../../shared/utils/retry';

interface OpenAIResponsesApiResult {
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
    const isValid = await withRetry(async () => await provider.checkAPIKeyValid(apiKey), {
      label: 'AiProvider.checkAPIKeyValid',
    }) as Result<true>;
    if (!isValid.ok) {
      throw new ValidationError(`Invalid API Key for ${model}: ${isValid.error}`);
    }

    return true;
  }



  /**
   * AI 챗 메시지를 처리하는 핵심 메서드 (files 매개변수 추가됨)
   * @prop ownerUserId 사용자 ID
   * @prop chatbody AI 챗 메시지
   * @prop conversationId 대화방 ID
   * @prop files 첨부파일
   * @prop onStream 스트리밍 콜백
   * @returns AI 챗 응답
   */
  async handleAIChat(
    ownerUserId: string,
    chatbody: AIchatType,
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      // 0. 파일 업로드 (S3 저장 및 첨부파일 메타데이터 생성)
      const userAttachments : Attachment[] = await this.handleFiles(files);

      // 1. API Key 조회 & Provider 획득
      const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, chatbody.model);
      const apiKey = apiKeyResponse.apiKey;

      if (!apiKey) {
        throw new ForbiddenError(
          `API Key for model ${chatbody.model} not found. Please register it in settings.`
        );
      }

      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
      }

      // 2. 개발 환경 제외하고 API Key 실제 유효성 검사
      if (process.env.NODE_ENV !== 'development') {
        const isValid = await withRetry(async () => await provider.checkAPIKeyValid(apiKey), {
          label: 'AiProvider.checkAPIKeyValid',
        });
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
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || err instanceof NotFoundError) {
          isNewConversation = true;
          const preferredLanguage: string = await this.userService.getPreferredLanguage(ownerUserId);
          const titleRequest = await withRetry(
            async () => await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, { language: preferredLanguage }),
            { label: 'AiProvider.requestGenerateThreadTitle' }
          );
          newTitle = titleRequest.ok ? titleRequest.data : 'New Conversation';
          conversation = await this.chatManagementService.createConversation(ownerUserId, conversationId, newTitle);
        } else throw err;
      }

      // 4. 메시지 구성 (Stateless History)
      const historyMessages :ChatMessage[] = await this.chatManagementService.getMessages(conversationId);

      // 5. 현재 사용자 메시지 구성
      let currentUserChatMessage: ChatMessage = {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      };
      
      const fullMessages = [...historyMessages, currentUserChatMessage];

      // 6. AI Provider 호출
      const aiResponseResult = await withRetry(
        async () => await provider.generateChat(apiKey, { model: chatbody.modelName, messages: fullMessages }, onStream, this.storageAdapter),
        { label: 'AiProvider.generateChat' }
      );

      if (!aiResponseResult.ok) throw new UpstreamError(`AI Generation failed: ${aiResponseResult.error}`);

      const aiResponse : AiResponse = aiResponseResult.data;

      // 8. 메시지 저장
      const userMessage = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      });

      const aiMessage = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
        role: 'assistant',
        content: aiResponse.content,
        attachments: aiResponse.attachments,
        metadata: aiResponse.metadata,
      });

      return {
        title: isNewConversation ? newTitle || conversation?.title : undefined,
        messages: [userMessage, aiMessage],
      };

    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleAIChat failed', { cause: String(err) });
    }
  }

  /**
   * RAG 기반 AI 챗 메시지 처리
   * FE가 제공한 맥락(retrievedContext)을 시스템 프롬프트 형태로 주입하여 호출함.
   * 
   * @prop ownerUserId 사용자 ID
   * @prop chatbody AI 챗 메시지
   * @prop conversationId 대화방 ID
   * @prop files 첨부파일
   * @prop onStream 스트리밍 콜백
   * @returns AI 챗 응답
   */
  async handleRagAIChat(
    ownerUserId: string,
    chatbody: { id: string; model: ApiKeyModel; chatContent: string; modelName?: string; retrievedContext: ChatMessage[]; recentMessages: ChatMessage[] },
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      const userAttachments = await this.handleFiles(files);

      // 1. API Key 조회 & Provider 획득
      const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, chatbody.model);
      const apiKey = apiKeyResponse.apiKey;

      if (!apiKey) {
        throw new ForbiddenError(
          `API Key for model ${chatbody.model} not found. Please register it in settings.`
        );
      }

      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
      }

      // 2. 개발 환경 제외하고 API Key 실제 유효성 검사
      if (process.env.NODE_ENV !== 'development') {
        const isValid = await withRetry(async () => await provider.checkAPIKeyValid(apiKey), {
          label: 'AiProvider.checkAPIKeyValid(RAG)',
        });
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
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || (err instanceof Error && err.name === 'NotFoundError') || err instanceof NotFoundError) {
          isNewConversation = true;
          const preferredLanguage: string = await this.userService.getPreferredLanguage(ownerUserId);
          const titleRequest = await withRetry(
            async () => await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, { language: preferredLanguage }),
            { label: 'AiProvider.requestGenerateThreadTitle(RAG)' }
          );
          newTitle = titleRequest.ok ? titleRequest.data : 'New RAG Conversation';
          conversation = await this.chatManagementService.createConversation(ownerUserId, conversationId, newTitle);
        } else throw err;
      }

      // 2. RAG 프롬프트 조립
      const contextText = chatbody.retrievedContext
        .map((m, i) => `[참고 ${i + 1} (${m.role})]: ${m.content}`)
        .join('\n');

      const systemInstruction: ChatMessage = {
        id: 'system-rag',
        role: 'system',
        content: `당신은 제공된 [참고 정보]를 바탕으로 답변하는 비서입니다. 
          관련이 없는 질문은 일반적인 지식으로 답변하되, 가능한 제공된 맥락을 최우선으로 하세요.

          [참고 정보]
          ${contextText}`,
      };

      // 3. 메시지 목록 구성
      const currentUserMessage: ChatMessage = {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      };

      const fullMessages = [systemInstruction, ...chatbody.recentMessages, currentUserMessage];

      // 4. AI 생성
      const result = await withRetry(
        () => provider.generateChat(apiKey, { model: chatbody.modelName, messages: fullMessages }, onStream, this.storageAdapter),
        { label: 'AiProvider.generateChat(RAG)' }
      );
      if (!result.ok) throw new UpstreamError(`AI Generation failed: ${result.error}`);

      const aiResponse = result.data;

      // 5. DB 저장
      const dbUserMsg = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      });
      const dbAiMsg = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
        role: 'assistant',
        content: aiResponse.content,
        attachments: aiResponse.attachments,
        metadata: { ...aiResponse.metadata, ragContextCount: chatbody.retrievedContext.length },
      });

      return { 
        title: isNewConversation ? conversation.title : undefined, 
        messages: [dbUserMsg, dbAiMsg] 
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleRagAIChat failed', { cause: String(err) });
    }
  }

  /**
   * 파일 다운로드
   * @param key 파일 키
   * @returns 파일 스트림
   */
  async downloadFile(key: string): Promise<Readable> {
    return withRetry(
      async () => await this.storageAdapter.downloadStream(key, { bucketType: 'file' }),
      { label: 'Storage.downloadStream' }
    );
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
      await withRetry(
        async () => await this.storageAdapter.upload(key, file.buffer, file.mimetype, { bucketType: 'file' }),
        { label: 'Storage.upload' }
      );

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
}
