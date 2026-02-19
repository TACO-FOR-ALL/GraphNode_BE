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
import { AiResponse, getAiProvider, IAiProvider } from '../../shared/ai-providers/index';
import { ApiKeyModel } from '../../shared/dtos/me';
import { Attachment } from '../../shared/dtos/ai';
import { StoragePort } from '../ports/StoragePort';

import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

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
    const isValid = await provider.checkAPIKeyValid(apiKey);
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
      //    User가 보낸 파일은 먼저 우리 스토리지에 저장되어야 함.
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

      // 2. 개발 환경 제외하고 API Key 실제 유효성 검사 (옵션)
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
          // 제목 생성 (Legacy method call - safe to keep or refactor later)
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

      // 4. 메시지 구성 (Stateless History)
      //    DB에서 과거 기록 조회 -> Provider용 Request 포맷 변환
      const historyMessages :ChatMessage[] = await this.chatManagementService.getMessages(conversationId);


      // 5. 현재 사용자 메시지 구성 (멀티모달 지원)
      let currentUserChatMessage: ChatMessage = {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      };
      
      // 최종 전송 메시지 목록 = 과거 + 현재
      const fullMessages = [...historyMessages, currentUserChatMessage];

      // 6. AI Provider 호출 (Unified Interface)
      const aiResponseResult = await provider.generateChat(
          apiKey,
          {
              model: chatbody.modelName, // TODO: Map to specific model names if needed
              messages: fullMessages,
          },
          onStream,
          this.storageAdapter
      );

      if (!aiResponseResult.ok) {
          throw new UpstreamError(`AI Generation failed: ${aiResponseResult.error}`);
      }

      // AI 응답 획득(Stream 처리 다 끝난 후에 DB 저장 위한 데이터)
      const aiResponse : AiResponse = aiResponseResult.data;

      // 8. 메시지 저장 (User & AI)
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
        title: isNewConversation ? newTitle || conversation.title : undefined,
        messages: [userMessage, aiMessage],
      };

    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleAIChat failed', { cause: String(err) });
    }
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


}


