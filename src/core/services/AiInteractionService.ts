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
import {
  NotFoundError,
  UpstreamError,
  ValidationError,
  ForbiddenError,
  RateLimitError,
} from '../../shared/errors/domain';
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
    const isValid = (await withRetry(async () => await provider.checkAPIKeyValid(apiKey), {
      label: 'AiProvider.checkAPIKeyValid',
    })) as Result<true>;
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
      const userAttachments: Attachment[] = await this.handleFiles(files);

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
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || err instanceof NotFoundError) {
          isNewConversation = true;
          const preferredLanguage: string =
            await this.userService.getPreferredLanguage(ownerUserId);
          const titleRequest = await withRetry(
            async () =>
              await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, {
                language: preferredLanguage,
              }),
            { label: 'AiProvider.requestGenerateThreadTitle' }
          );
          newTitle = titleRequest.ok ? titleRequest.data : 'New Conversation';
          conversation = await this.chatManagementService.createConversation(
            ownerUserId,
            conversationId,
            newTitle
          );
        } else throw err;
      }

      // 4. 메시지 구성 (Stateless History)
      const historyMessages: ChatMessage[] =
        await this.chatManagementService.getMessages(conversationId);

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
        async () =>
          await provider.generateChat(
            apiKey,
            { model: chatbody.modelName, messages: fullMessages },
            onStream,
            this.storageAdapter
          ),
        { label: 'AiProvider.generateChat' }
      );

      if (!aiResponseResult.ok) {
        if (aiResponseResult.error === 'rate_limited') {
          throw new RateLimitError('AI Generation failed: rate limited. Please check your quota.');
        }
        throw new UpstreamError(`AI Generation failed: ${aiResponseResult.error}`);
      }

      const aiResponse: AiResponse = aiResponseResult.data;

      // 8. 메시지 저장
      const userMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          id: chatbody.id,
          role: 'user',
          content: chatbody.chatContent,
          attachments: userAttachments,
        }
      );

      const aiMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          role: 'assistant',
          content: aiResponse.content,
          attachments: aiResponse.attachments,
          metadata: aiResponse.metadata,
        }
      );

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
    chatbody: {
      id: string;
      model: ApiKeyModel;
      chatContent: string;
      modelName?: string;
      retrievedContext: ChatMessage[];
      recentMessages: ChatMessage[];
    },
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
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch (err: any) {
        if (
          err.code === 'NOT_FOUND' ||
          (err instanceof Error && err.name === 'NotFoundError') ||
          err instanceof NotFoundError
        ) {
          isNewConversation = true;
          const preferredLanguage: string =
            await this.userService.getPreferredLanguage(ownerUserId);
          const titleRequest = await withRetry(
            async () =>
              await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, {
                language: preferredLanguage,
              }),
            { label: 'AiProvider.requestGenerateThreadTitle(RAG)' }
          );
          newTitle = titleRequest.ok ? titleRequest.data : 'New RAG Conversation';
          conversation = await this.chatManagementService.createConversation(
            ownerUserId,
            conversationId,
            newTitle
          );
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
        () =>
          provider.generateChat(
            apiKey,
            { model: chatbody.modelName, messages: fullMessages },
            onStream,
            this.storageAdapter
          ),
        { label: 'AiProvider.generateChat(RAG)' }
      );
      if (!result.ok) {
        if (result.error === 'rate_limited') {
          throw new RateLimitError('AI Generation failed: rate limited. Please check your quota.');
        }
        throw new UpstreamError(`AI Generation failed: ${result.error}`);
      }

      const aiResponse = result.data;

      // 5. DB 저장
      const dbUserMsg = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          id: chatbody.id,
          role: 'user',
          content: chatbody.chatContent,
          attachments: userAttachments,
        }
      );
      const dbAiMsg = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
        role: 'assistant',
        content: aiResponse.content,
        attachments: aiResponse.attachments,
        metadata: { ...aiResponse.metadata, ragContextCount: chatbody.retrievedContext.length },
      });

      return {
        title: isNewConversation ? conversation.title : undefined,
        messages: [dbUserMsg, dbAiMsg],
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleRagAIChat failed', {
        cause: String(err),
      });
    }
  }

  /**
   * AI 챗 재시도 처리
   * 대화방의 가장 최근 메시지가 AI의 응답인지 확인 후, 해당 메시지를 영구 삭제하고 이전 기록으로 새 응답을 생성합니다.
   * @prop ownerUserId 사용자 ID
   * @prop retrybody AI 재시도 모델 정보
   * @prop conversationId 대화방 ID
   * @prop onStream 스트리밍 콜백
   * @returns 새로운 AI 챗 응답
   */
  async handleRetryAIChat(
    ownerUserId: string,
    retrybody: { model: ApiKeyModel; modelName?: string },
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      // 1. API Key 조회 & Provider 획득
      const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, retrybody.model);
      const apiKey = apiKeyResponse.apiKey;

      if (!apiKey) {
        throw new ForbiddenError(
          `API Key for model ${retrybody.model} not found. Please register it in settings.`
        );
      }

      let provider: IAiProvider;
      try {
        provider = getAiProvider(retrybody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${retrybody.model}`);
      }

      // 2. 개발 환경 제외하고 API Key 실제 유효성 검사
      if (process.env.NODE_ENV !== 'development') {
        const isValid = await withRetry(async () => await provider.checkAPIKeyValid(apiKey), {
          label: 'AiProvider.checkAPIKeyValid(Retry)',
        });
        if (!isValid.ok) {
          throw new ValidationError(`Invalid API Key for ${retrybody.model}: ${isValid.error}`);
        }
      }

      // 3. 대화방 조회 (없는 경우 에러)
      let conversation: ChatThread;
      try {
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch (err: any) {
        throw new NotFoundError(`Conversation not found for retry: ${conversationId}`);
      }

      // 4. 메시지 기록 조회
      const historyMessages: ChatMessage[] =
        await this.chatManagementService.getMessages(conversationId);
      if (historyMessages.length === 0) {
        throw new ValidationError('No messages found in the conversation to retry.');
      }

      // 5. 가장 최근 메시지 확인 (AI 메시지인지 검증)
      const lastMessage = historyMessages[historyMessages.length - 1];
      if (lastMessage.role !== 'assistant') {
        throw new ValidationError(
          'The last message in this conversation is not from the assistant. Cannot retry.'
        );
      }

      // 6. 이전 AI 메시지 영구 삭제 (재시도를 위해)
      await this.chatManagementService.deleteMessage(
        ownerUserId,
        conversationId,
        lastMessage.id,
        true
      );

      // 7. 삭제된 메시지를 제외한 내역으로 AI Provider 다시 호출
      const newHistoryMessages = historyMessages.slice(0, historyMessages.length - 1);

      // 추가로 전달된 파일이 있다면, 가장 마지막 사용자 메시지에 파일(attachments)을 추가
      const newAttachments = await this.handleFiles(files);
      if (newAttachments.length > 0 && newHistoryMessages.length > 0) {
        const lastUserMessage = newHistoryMessages[newHistoryMessages.length - 1];
        if (lastUserMessage.role === 'user') {
          lastUserMessage.attachments = [...(lastUserMessage.attachments || []), ...newAttachments];
          // DB에도 업데이트 시켜줌
          await this.chatManagementService.updateMessage(
            ownerUserId,
            conversationId,
            lastUserMessage.id,
            {
              attachments: lastUserMessage.attachments,
            }
          );
        }
      }

      const aiResponseResult = await withRetry(
        async () =>
          await provider.generateChat(
            apiKey,
            { model: retrybody.modelName, messages: newHistoryMessages },
            onStream,
            this.storageAdapter
          ),
        { label: 'AiProvider.generateChat(Retry)' }
      );

      if (!aiResponseResult.ok) {
        if (aiResponseResult.error === 'rate_limited') {
          throw new RateLimitError(
            'AI Generation retry failed: rate limited. Please check your quota.'
          );
        }
        throw new UpstreamError(`AI Generation retry failed: ${aiResponseResult.error}`);
      }

      const aiResponse: AiResponse = aiResponseResult.data;

      // 8. 새로운 AI 메시지 저장
      const newAiMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          role: 'assistant',
          content: aiResponse.content,
          attachments: aiResponse.attachments,
          metadata: aiResponse.metadata,
        }
      );

      return {
        title: conversation.title,
        messages: [newAiMessage],
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleRetryAIChat failed', {
        cause: String(err),
      });
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
        async () =>
          await this.storageAdapter.upload(key, file.buffer, file.mimetype, { bucketType: 'file' }),
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
