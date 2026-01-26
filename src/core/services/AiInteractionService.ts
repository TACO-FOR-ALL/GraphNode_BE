/**
 * 모듈: AiInteractionService (AI 채팅 서비스)
 *
 * 책임:
 * - AI 모델(OpenAI 등)과의 대화 로직을 조율합니다.
 * - 사용자의 메시지를 받아 AI에게 전달하고, 응답을 받아 저장합니다.
 * - ChatManagementService를 사용하여 대화 내용과 메시지를 관리합니다.
 *
 * 외부 의존:
 * - ChatManagementService: 대화방 및 메시지 관리 (트랜잭션 포함)
 * - UserService: API Key 조회
 * - OpenAI SDK: 실제 AI 모델 호출
 */

import { AppError } from '../../shared/errors/base';
import { NotFoundError, UpstreamError, ValidationError } from '../../shared/errors/domain';
import { AIchatType } from '../../shared/ai-providers/AIchatType';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { AIChatResponseDto, ChatMessage, ChatThread } from '../../shared/dtos/ai';
import { getAiProvider, IAiProvider, Result } from '../../shared/ai-providers/index';
import { ChatMessageRequest } from '../../shared/ai-providers/ChatMessageRequest';

export class AiInteractionService {
  // 생성자 주입을 통해 필요한 하위 서비스들을 의존성으로 받습니다.
  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly userService: UserService
  ) {}

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
  async handleAIChat(
    ownerUserId: string,
    chatbody: AIchatType,
    conversationId: string
  ): Promise<AIChatResponseDto> {
    try {
      // 1. API Key 조회
      const apiKeyResponse = await this.userService.getApiKeys(ownerUserId, chatbody.model);
      const apiKey = apiKeyResponse.apiKey;

      if (!apiKey) {
        throw new ValidationError(
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

      // 2. API Key 검증
      const isValid = await provider.checkAPIKeyValid(apiKey);
      if (!isValid.ok) {
        throw new ValidationError(`Invalid API Key for ${chatbody.model}: ${isValid.error}`);
      }

      // 3. 이전 대화 내역 조회
      let conversation: ChatThread; // 대화방 정보
      let isNewConversation: boolean = false; // 신규 대화방 생성 여부
      let newTitle: string | null = null; // 신규 대화방 제목

      try {
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch (err) {
        // NotFoundError 인 경우에만 신규 채팅방 생성 로직 수행
        if (err instanceof NotFoundError) {
          isNewConversation = true;

          // 신규 대화방 제목 우선 생성
          // 제목 생성도 해당 Provider 사용 (일관성)
          const titleRequest = await provider.requestGenerateThreadTitle(
            apiKey,
            chatbody.chatContent
          );

          // 우선 제목 생성에 실패하면, 임시 제목 할당
          if (!titleRequest.ok) {
            newTitle = 'New Conversation';
          } else {
            newTitle = titleRequest.data;
          }

          // 신규 대화방 생성
          conversation = await this.chatManagementService.createConversation(
            ownerUserId,
            conversationId,
            newTitle!
          );
        } else {
          throw err; // 다른 에러는 그대로 던짐
        }
      }

      // 대화 내역 가져오기
      const history: ChatMessage[] = conversation.messages || [];

      // 4. 메시지 변환 (History + User New Message)
      const messagesToSend: ChatMessageRequest[] = this.toChatMessageRequest(history);
      messagesToSend.push({
        role: 'user',
        content: chatbody.chatContent,
      });

      // 5. AI API 요청
      // TODO: 세부 모델명(gpt-4o-mini, claude-3-haiku 등)은 chatbody.model에 매핑되거나 별도 설정 필요
      // 현재는 adapter 내부나 여기서 간단히 매핑
      let detailedModelName = '';
      switch (chatbody.model) {
        case 'openai':
          detailedModelName = 'gpt-4o-mini';
          break;
        case 'deepseek':
          detailedModelName = 'deepseek-chat';
          break;
        case 'claude':
          detailedModelName = 'claude-3-haiku-20240307';
          break;
        case 'gemini':
          detailedModelName = 'gemini-pro';
          break;
      }

      const aiResponse = await provider.requestWithoutStream(
        apiKey,
        detailedModelName,
        messagesToSend
      );

      // AI 응답 실패 시 예외 처리
      if (!aiResponse.ok) {
        throw new UpstreamError(`AI Request failed: ${aiResponse.error}`);
      }

      // 6. AI 응답 추출 (Provider가 공통 포맷으로 반환한다고 가정)
      // Adapter가 { choices: [{ message: { content } }] } 형태 또는 유사 구조를 반환해야 함.
      // 여기서는 Adapter가 호환성 있게 데이터 구조를 맞춰준다고 가정하거나, any 타입으로 유연하게 처리.
      // Adapter 구현체(Claude, Gemini)에서 OpenAiLikeResponse를 반환하도록 작성했음.

      const aiResponseData = aiResponse.data;
      const aiContent = aiResponseData.choices?.[0]?.message?.content;

      if (!aiContent) {
        throw new UpstreamError('AI response content is empty.');
      }

      // 7. 메시지 저장 (User & AI)
      // ChatManagementService를 사용하여 메시지를 저장하고 대화방의 updatedAt을 갱신합니다.
      const userMessage: ChatMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          id: chatbody.id,
          role: 'user',
          content: chatbody.chatContent,
        }
      );

      const aiMessage: ChatMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          role: 'assistant',
          content: aiContent,
        }
      );

      // 8. 결과 반환
      return {
        title: isNewConversation ? newTitle || conversation.title : undefined,
        messages: [userMessage, aiMessage],
      };
    } catch (err: unknown) {
      // 이미 정의된 AppError라면 그대로 던짐
      if (err instanceof AppError) throw err;
      // 알 수 없는 에러는 UpstreamError로 감싸서 던짐
      throw new UpstreamError('AiInteractionService.handleAIChat failed', { cause: String(err) });
    }
  }

  private toChatMessageRequest(messages: ChatMessage[]): ChatMessageRequest[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }
}
