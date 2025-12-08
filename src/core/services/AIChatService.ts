/**
 * 모듈: AIChatService (AI 채팅 서비스)
 * 
 * 책임: 
 * - AI 모델(OpenAI 등)과의 대화 로직을 조율합니다.
 * - 사용자의 메시지를 받아 AI에게 전달하고, 응답을 받아 저장합니다.
 * - ConversationService와 MessageService를 사용하여 대화 내용을 관리합니다.
 * 
 * 외부 의존:
 * - ConversationService: 대화방 관리
 * - MessageService: 메시지 저장 및 관리
 * - UserService: API Key 조회
 * - OpenAI SDK: 실제 AI 모델 호출
 */

import OpenAI from 'openai';

import { AppError } from '../../shared/errors/base'; 
import { UpstreamError, ValidationError } from '../../shared/errors/domain';
import { AIchatType } from '../../shared/openai/AIchatType';
import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';
import { UserService } from './UserService';
import { ChatMessage } from '../../shared/dtos/ai';
import { openAI } from '../../shared/openai/index';
import { ChatMessageRequest } from '../../shared/openai/ChatMessageRequest';

export class AIChatService {
    // 생성자 주입을 통해 필요한 하위 서비스들을 의존성으로 받습니다.
    constructor(
        private readonly conversationService: ConversationService,
        private readonly messageService: MessageService,
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
    async handleAIChat(ownerUserId: string, chatbody: AIchatType, conversationId: string): Promise<ChatMessage[]> {
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
            const conversation = await this.conversationService.getById(conversationId, ownerUserId);
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
            
            const aiResponse = await openAI.requestWithoutStream(apiKey, modelName, messagesToSend);

            if (!aiResponse.ok) {
                throw new UpstreamError(`AI Request failed: ${aiResponse.error}`);
            }

            const aiResponseData: OpenAI.Chat.Completions.ChatCompletion = aiResponse.data;

            // 6. AI 응답 추출
            const aiContent: string | null | undefined = aiResponseData.choices?.[0]?.message?.content;
            if (!aiContent) {
                throw new UpstreamError('AI response content is empty.');
            }

            // 7. 메시지 저장 (User & AI)
            const userMessage: ChatMessage = await this.messageService.create(ownerUserId, conversationId, {
                role: 'user',
                content: chatbody.chatContent
            });

            const aiMessage: ChatMessage = await this.messageService.create(ownerUserId, conversationId, {
                role: 'assistant',
                content: aiContent
            });

            // 8. 결과 반환
            return [userMessage, aiMessage];

        } catch (err: unknown) {
            // 이미 정의된 AppError라면 그대로 던짐
            if (err instanceof AppError) throw err;
            // 알 수 없는 에러는 UpstreamError로 감싸서 던짐
            throw new UpstreamError('AIChatService.handleAIChat failed', { cause: String(err) });
        }
    }

    private toChatMessageRequest(messages: ChatMessage[]): ChatMessageRequest[] {
        return messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }
}


