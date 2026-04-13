/**
 * 모듈: AiInteractionService (AI 채팅 서비스)
 *
 * 책임:
 * - AI 모델(OpenAI, Gemini, Claude)과의 대화 로직을 조율합니다.
 * - 사용자의 메시지를 받아 AI에게 전달하고, 응답을 받아 저장합니다.
 * - ChatManagementService를 사용하여 대화 내용과 메시지를 관리합니다.
 * - DailyUsageService를 통해 사용자당 일일 대화 한도(20회)를 강제합니다.
 * - AI API 키는 환경변수(서비스 자체 키)에서 조회합니다. 사용자 키를 쓰지 않습니다.
 *
 * 외부 의존:
 * - AI Provider SDK: 실제 AI 모델 호출
 * - loadEnv: 서비스 자체 API 키 조회
 */

import 'multer'; // Ensure Multer types are loaded
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

import { AppError } from '../../shared/errors/base';
import {
  NotFoundError,
  UpstreamError,
  ValidationError,
  RateLimitError,
} from '../../shared/errors/domain';
import { AIchatType } from '../../shared/ai-providers/AIchatType';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { DailyUsageService } from './DailyUsageService';
import { AIChatResponseDto, ChatMessage, ChatThread, Attachment } from '../../shared/dtos/ai';
import { AiResponse, getAiProvider, IAiProvider } from '../../shared/ai-providers/index';
import { ApiKeyModel } from '../../shared/dtos/me';
import { StoragePort } from '../ports/StoragePort';
import { withRetry } from '../../shared/utils/retry';
import { captureEvent } from '../../shared/utils/posthog';
import { loadEnv } from '../../config/env';
import { captureEvent, POSTHOG_EVENT } from '../../shared/utils/posthog';

interface OpenAIResponsesApiResult {
  content: string;
  attachments?: Attachment[];
  metadata?: any;
}

export class AiInteractionService {
  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly userService: UserService,
    private readonly storageAdapter: StoragePort,
    private readonly dailyUsageService: DailyUsageService
  ) {}

  /**
   * 모델에 해당하는 서비스 자체 API 키를 환경변수에서 반환합니다.
   *
   * @description env.ts가 시작 시점에 키 존재를 검증하므로 런타임에는 항상 유효한 키가 반환됩니다.
   * @param model AI 모델 식별자
   * @returns 서비스 자체 API 키 문자열
   * @throws {ValidationError} VALIDATION_FAILED — 지원하지 않는 모델
   */
  private getSystemApiKey(model: ApiKeyModel): string {
    const env = loadEnv();
    switch (model) {
      case 'openai':
      case 'deepseek':
        return env.OPENAI_API_KEY;
      case 'gemini':
        return env.GEMINI_API_KEY;
      case 'claude':
        return env.CLAUDE_API_KEY;
      default:
        throw new ValidationError(`Unsupported AI model: ${model}`);
    }
  }

  /**
   * 서비스 자체 API 키 유효성 확인
   *
   * @description
   *   서비스 키로 전환 이후, 이 메서드는 해당 모델의 시스템 키가 환경변수에
   *   올바르게 구성되어 있는지 확인합니다.
   *   env.ts가 시작 시 검증하므로 정상 운영 중에는 항상 true를 반환합니다.
   * @param ownerUserId 요청자 사용자 ID (사용량 확인용)
   * @param model 확인할 AI 모델
   * @returns true (시스템 키가 구성된 경우)
   * @throws {ValidationError} VALIDATION_FAILED — 지원하지 않는 모델
   */
  async checkApiKey(ownerUserId: string, model: ApiKeyModel): Promise<boolean> {
    // 시스템 키 존재 확인 (getSystemApiKey가 throw하지 않으면 정상)
    this.getSystemApiKey(model);
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
      // 0. 일일 사용량 한도 사전 확인 (한도 초과 시 즉시 RateLimitError throw, 카운트 변화 없음)
      await this.dailyUsageService.checkLimit(ownerUserId);

      // 1. 파일 업로드 (S3 저장 및 첨부파일 메타데이터 생성)
      const userAttachments: Attachment[] = await this.handleFiles(files);

      // 2. 서비스 자체 API 키 조회 & Provider 획득
      const apiKey = this.getSystemApiKey(chatbody.model);

      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
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

      // 3-a. [NEW_CONVERSATION 예약어] 웹 클라이언트 전용 제목 자동 생성 경로
      //
      // 배경:
      //   모바일 앱은 로컬 DB를 보유하므로 대화방 생성 시점에 제목을 즉시 결정할 수 있다.
      //   반면 웹 클라이언트는 로컬 DB가 없어 화면에 대화방을 표시하려면 먼저
      //   서버에 POST /conversations 를 호출해 placeholder 제목("New Conversation")으로
      //   대화방을 미리 생성해야 한다.
      //   이 시점에서는 아직 사용자가 어떤 메시지를 보낼지 모르므로 의미있는 제목을 만들 수 없다.
      //
      // 흐름:
      //   1. 웹 클라이언트가 POST /conversations → placeholder 제목으로 대화방 선생성
      //   2. 사용자가 첫 메시지 입력
      //   3. 웹 클라이언트가 POST /chat 시 body에 { title: 'NEW_CONVERSATION' } 포함
      //   4. 서버가 이 예약어를 감지 → AI로 제목 생성 → DB 즉시 업데이트 → RESULT 이벤트에 포함
      //   5. 웹 클라이언트는 RESULT를 받아 UI 제목을 즉시 갱신 (loading... 없음)
      //
      // 주의:
      //   - `!isNewConversation` 가드: 대화방이 없어 새로 만들 때(위 catch 블록)는
      //     이미 제목이 생성되고 newTitle이 세팅되므로 중복 호출을 방지한다.
      //   - 제목 생성 실패 시(titleRequest.ok === false) newTitle = null 로 유지하며
      //     DB 업데이트도 건너뛴다. RESULT의 title 필드는 undefined가 되어 생략된다.
      if (!isNewConversation && chatbody.title === 'NEW_CONVERSATION') {
        const preferredLanguage: string =
          await this.userService.getPreferredLanguage(ownerUserId);
        const titleRequest = await withRetry(
          async () =>
            await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, {
              language: preferredLanguage,
            }),
          { label: 'AiProvider.requestGenerateThreadTitle' }
        );
        newTitle = titleRequest.ok ? titleRequest.data : null;
        if (newTitle) {
          await this.chatManagementService.updateConversation(conversationId, ownerUserId, {
            title: newTitle,
          });
        }
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

      // 메시지 저장 완료 후 카운트 증가 (성공한 대화에만 소모)
      await this.dailyUsageService.incrementUsage(ownerUserId);

      captureEvent(ownerUserId, 'ai_chat_completed', {
      captureEvent(ownerUserId, POSTHOG_EVENT.AI_CHAT_COMPLETED, {
        model_name: chatbody.modelName,
        chat_type: 'normal',
        attachments_count: userAttachments.length,
      });

      // newTitle은 (신규 대화방 생성) 또는 (NEW_CONVERSATION 예약어) 케이스에서만 설정된다.
      return {
        title: newTitle ?? undefined,
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
      // 0. 일일 사용량 한도 사전 확인 (한도 초과 시 즉시 RateLimitError throw, 카운트 변화 없음)
      await this.dailyUsageService.checkLimit(ownerUserId);

      const userAttachments = await this.handleFiles(files);

      // 1. 서비스 자체 API 키 조회 & Provider 획득
      const apiKey = this.getSystemApiKey(chatbody.model);

      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
      }

      // 2. 대화방 조회 또는 생성
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

      // 메시지 저장 완료 후 카운트 증가 (성공한 대화에만 소모)
      await this.dailyUsageService.incrementUsage(ownerUserId);

      captureEvent(ownerUserId, 'ai_chat_completed', {
      captureEvent(ownerUserId, POSTHOG_EVENT.AI_CHAT_COMPLETED, {
        model_name: chatbody.modelName,
        chat_type: 'rag',
        attachments_count: userAttachments.length,
        context_count: chatbody.retrievedContext.length,
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
      // 1. 일일 사용량 한도 사전 확인 (한도 초과 시 즉시 RateLimitError throw, 카운트 변화 없음)
      await this.dailyUsageService.checkLimit(ownerUserId);

      // 2. 서비스 자체 API 키 조회 & Provider 획득
      const apiKey = this.getSystemApiKey(retrybody.model);

      let provider: IAiProvider;
      try {
        provider = getAiProvider(retrybody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${retrybody.model}`);
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

      // 메시지 저장 완료 후 카운트 증가 (성공한 대화에만 소모)
      await this.dailyUsageService.incrementUsage(ownerUserId);

      captureEvent(ownerUserId, 'ai_chat_completed', {
      captureEvent(ownerUserId, POSTHOG_EVENT.AI_CHAT_COMPLETED, {
        model_name: retrybody.modelName,
        chat_type: 'retry',
      });

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
