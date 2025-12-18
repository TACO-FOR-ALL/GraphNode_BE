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

import OpenAI from 'openai';

import { AppError } from '../../shared/errors/base'; 
import { NotFoundError, UpstreamError, ValidationError } from '../../shared/errors/domain';
import { AIchatType } from '../../shared/openai/AIchatType';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { AIChatResponseDto, ChatMessage, ChatThread } from '../../shared/dtos/ai';
import { openAI, Result } from '../../shared/openai/index';
import { ChatMessageRequest } from '../../shared/openai/ChatMessageRequest';

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
    async handleAIChat(ownerUserId: string, chatbody: AIchatType, conversationId: string): Promise<AIChatResponseDto> {
        try {
            // 1. API Key 조회
            const apiKeyResponse: { apiKey: string | null } = await this.userService.getApiKeys(ownerUserId, chatbody.model);
            const apiKey: string | null = apiKeyResponse.apiKey;

            if (!apiKey) {
                throw new ValidationError(`API Key for model ${chatbody.model} not found.`);
            }

            // 2. API Key 검증 (OpenAI만)
            if (chatbody.model === 'openai') {
                const isValid: { ok: boolean; error?: string } = await openAI.checkAPIKeyValid(apiKey);
                if (!isValid.ok) {
                    throw new ValidationError(`Invalid OpenAI API Key: ${isValid.error}`);
                }
            } else if (chatbody.model === 'deepseek') {
                // TODO: DeepSeek API Key validation
            }

            // 3. 이전 대화 내역 조회
            // ChatManagementService를 통해 대화방과 메시지 목록을 함께 가져옵니다.
            // 임시로 try catch로 처리

            let conversation : ChatThread; // 대화방 정보
            let isNewConversation : boolean = false; // 신규 대화방 생성 여부
            let newTitle : string | null = null; // 신규 대화방 제목
            
            try {
                conversation  = await this.chatManagementService.getConversation(conversationId, ownerUserId);
            } catch (err) {
                // NotFoundError 인 경우에만 신규 채팅방 생성 로직 수행
                if (err instanceof NotFoundError) {
                    isNewConversation = true; 
                
                    // 신규 대화방 제목 우선 생성
                    const titleRequest: Result<string>  = await openAI.requestGenerateThreadTitle(apiKey, chatbody.chatContent);

                    // 우선 제목 생성에 실패하면, 임시 제목 할당
                    if (!titleRequest.ok) {
                        newTitle = "New Conversation";
                    }

                    if (titleRequest.ok) {
                        newTitle = titleRequest.data;
                    }

                    // 신규 대화방 생성
                    conversation = await this.chatManagementService.createConversation(ownerUserId, conversationId, newTitle!);
                
                }
                else {
                    throw err; // 다른 에러는 그대로 던짐
                }

            }

            // 대화 내역 가져오기
            const history: ChatMessage[] = conversation.messages || [];

            // 4. 메시지 변환 (History + User New Message)
            const messagesToSend: ChatMessageRequest[] = this.toChatMessageRequest(history);
            messagesToSend.push({
                role: 'user',
                content: chatbody.chatContent
            });

            // 5. OpenAI 요청
            // TODO: model selection logic based on chatbody.model or specific model name (e.g. gpt-4o-mini)
            const modelName: string = chatbody.model === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat'; 
            
            // OpenAI 요청
            const aiResponse = await openAI.requestWithoutStream(apiKey, modelName, messagesToSend);

            // AI 응답 실패 시 예외 처리
            if (!aiResponse.ok) {
                throw new UpstreamError(`AI Request failed: ${aiResponse.error}`);
            }

            // 6. AI 응답 추출
            const aiResponseData: OpenAI.Chat.Completions.ChatCompletion = aiResponse.data;

            const aiContent: string | null | undefined = aiResponseData.choices?.[0]?.message?.content;
            if (!aiContent) {
                throw new UpstreamError('AI response content is empty.');
            }

            // 7. 메시지 저장 (User & AI)
            // ChatManagementService를 사용하여 메시지를 저장하고 대화방의 updatedAt을 갱신합니다.
            const userMessage: ChatMessage = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
                id : chatbody.id,
                role: 'user',
                content: chatbody.chatContent
            });

            const aiMessage: ChatMessage = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
                role: 'assistant',
                content: aiContent
            });

            // 8. 결과 반환
            return {
                title: isNewConversation ? (newTitle || conversation.title) : undefined,
                messages: [userMessage, aiMessage]
            }

        } catch (err: unknown) {
            // 이미 정의된 AppError라면 그대로 던짐
            if (err instanceof AppError) throw err;
            // 알 수 없는 에러는 UpstreamError로 감싸서 던짐
            throw new UpstreamError('AiInteractionService.handleAIChat failed', { cause: String(err) });
        }
    }

    private toChatMessageRequest(messages: ChatMessage[]): ChatMessageRequest[] {
        return messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }
}


