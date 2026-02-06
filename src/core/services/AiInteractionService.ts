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

import { Readable } from 'stream';

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
   * AI 챗 메시지를 처리하는 핵심 메서드
   *
   * 역할:
   * 1. 사용자의 입력 메시지를 받습니다.
   * 2. 대화 컨텍스트(이전 메시지들)를 조회합니다.
   * 3. AI 모델(LLM) API를 호출하여 응답을 생성합니다.
   * 4. AI의 응답을 DB에 저장하고 반환합니다.
   *
   * @throws {UpstreamError} AI 서비스 호출 실패 시
   */
  /**
   * 사용자 API Key 조회 및 검증
   * @param ownerUserId 사용자 ID
   * @param chatbody 요청 본문 (모델 정보 포함)
   * @returns API Key (string)
   * @throws ForbiddenError
   */
  private async validateAndGetApiKey(ownerUserId: string, chatbody: AIchatType): Promise<string> {
    // 1. 사용자 API Key 조회 (UserService)
    const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, chatbody.model);
    
    // 2. 모델별 적절한 키 추출 (현재는 단일 필드로 가정되나, 향후 확장 가능)
    const apiKey = apiKeyResponse.apiKey;

    // 3. 검증
    if (!apiKey) {
      throw new ForbiddenError(
        `API Key for model ${chatbody.model} not found. Please register it in settings.`
      );
    }
    return apiKey;
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

      // --- OpenAI Assistants API 분기 ---
      if (chatbody.model === 'openai') {
        aiContent = await this.handleOpenAIAssistantsChat(
          ownerUserId,
          conversationId,
          apiKey,
          conversation,
          provider,
          chatbody,
          files,
          onStream
        );
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
   * OpenAI Assistants API 전용 처리 로직
   * - Thread 생성/조회, 파일 업로드, 메시지 추가, Run 실행, 스트리밍 처리
   */
  private async handleOpenAIAssistantsChat(
    ownerUserId: string,
    conversationId: string,
    apiKey: string,
    conversation: ChatThread,
    provider: IAiProvider,
    chatbody: AIchatType,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<string> {
    let aiContent = '';

    // 4-1. Thread 확인 및 생성
    let threadId = conversation.externalThreadId;
    if (!threadId) {
      const tRes = await provider.createThread(apiKey);
      if (!tRes.ok) throw new UpstreamError(`Failed to create creation: ${tRes.error}`);
      threadId = tRes.data.threadId;

      // DB에 Thread ID 업데이트
      conversation.externalThreadId = threadId;
      await this.chatManagementService.updateThreadId(conversationId, ownerUserId, threadId);
    }

    // 4-2. 파일 OpenAI 업로드 (Files API)
    const openAiFileIds: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const upRes = await provider.uploadFile(apiKey, {
          buffer: file.buffer,
          filename: file.filename || file.originalname,
          mimetype: file.mimetype,
        });
        if (upRes.ok) {
          openAiFileIds.push(upRes.data.fileId);
        } else {
          console.warn(`Failed to upload file to OpenAI: ${upRes.error}`);
        }
      }
    }

    // 4-3. 메시지 추가
    const addMsgRes = await provider.addMessage(
      apiKey,
      threadId!,
      'user',
      chatbody.chatContent,
      openAiFileIds
    );
    if (!addMsgRes.ok) throw new UpstreamError(`Failed to add message to thread: ${addMsgRes.error}`);


    // 4-4. Run Assistant (Stream)
    // Dynamic Assistant: 사용자 DB에 저장된 Assistant ID 사용, 없으면 생성
    let assistantId = await this.userService.getOpenAiAssistantId(ownerUserId);

    if (!assistantId) {
      const createRes = await provider.createAssistant(apiKey);
      if (!createRes.ok) throw new UpstreamError(`Failed to create assistant: ${createRes.error}`);
      assistantId = createRes.data.assistantId;
      await this.userService.updateOpenAiAssistantId(ownerUserId, assistantId);
    }

    const runRes = await provider.runAssistantStream(apiKey, assistantId!, threadId!);
    if (!runRes.ok) {
      if (runRes.error === 'not_found' || runRes.error === 'key_not_found') {
        throw new UpstreamError(
          `Failed to access Assistant (${assistantId}). This usually happens when the User API Key does not belong to the same OpenAI Organization as the Assistant.`
        );
      }
      throw new UpstreamError(`Failed to run assistant: ${runRes.error}`);
    }

    // 4-5. 스트리밍 처리
    // AsyncIterable<any> 이지만, 실제로는 OpenAI StreamEvent 객체들이 옴.
    for await (const chunk of runRes.data) {
       const event = chunk as any;
       if (event.event === 'thread.message.delta') {
         const delta = event.data.delta.content?.[0]?.text?.value;
         if (delta) {
           aiContent += delta;
           onStream?.(delta);
         }
       }
    }
    return aiContent;
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
      // 실제로는 CloudFront URL이나 Signed URL이 필요할 수 있음.
      // 여기서는 env에서 bucket URL을 조합하거나, 프론트에서 key로 다운로드 요청하도록 설계.
      // 우선은 key를 url 필드에 임시로 저장하거나, 다운로드 API 경로를 저장.
      // const url = `/api/v1/files/${key}`; // 예시 경로
      // Update: use /v1/ai/files/:key route
      const url = `/api/v1/ai/files/${key}`;

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

import { Attachment } from '../../shared/dtos/ai';
import { StoragePort } from '../ports/StoragePort';

import { v4 as uuidv4 } from 'uuid';import { ApiKeyModel } from '../../shared/dtos/me';

