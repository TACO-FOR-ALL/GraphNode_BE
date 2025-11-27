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
 * - (추후 추가 예정) OpenAI SDK: 실제 AI 모델 호출
 */

import { AppError } from '../../shared/errors/base';
import { UpstreamError } from '../../shared/errors/domain';
import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';

export class AIChatService {
    // 생성자 주입을 통해 필요한 하위 서비스들을 의존성으로 받습니다.
    constructor(
        private readonly conversationService: ConversationService,
        private readonly messageService: MessageService
    ) {}    

    /**
     * AI 챗 메시지를 처리하는 핵심 메서드
     * 
     * 역할:
     * 1. 사용자의 입력 메시지를 받습니다 (현재는 파라미터 정의 필요).
     * 2. 대화 컨텍스트(이전 메시지들)를 조회합니다.
     * 3. AI 모델(LLM) API를 호출하여 응답을 생성합니다.
     * 4. AI의 응답을 DB에 저장하고 반환합니다.
     * 
     * @throws {UpstreamError} AI 서비스 호출 실패 시
     */
    async handleAIChat() {
        try {
            // TODO: 1. 사용자 메시지 저장 (MessageService.create)
            // TODO: 2. 대화 컨텍스트 조회 (MessageRepository.findAllByConversationId)
            // TODO: 3. AI 모델 호출 (OpenAI API)
            // TODO: 4. AI 응답 메시지 저장 (MessageService.create)
            // TODO: 5. 응답 반환

        } catch (err: unknown) {
            // 이미 정의된 AppError라면 그대로 던짐
            if (err instanceof AppError) throw err;
            // 알 수 없는 에러는 UpstreamError로 감싸서 던짐
            throw new UpstreamError('AIChatService.handleAIChat failed', { cause: String(err) });
        }
    }
}


