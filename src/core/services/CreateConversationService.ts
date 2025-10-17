import { Conversation } from '../domain/Conversation';
import { ConversationRepository } from '../ports/ConversationRepository';
import { ValidationError } from '../../shared/errors/domain';

/**
 * CreateConversationService
 * 책임: 입력 검증 후 ConversationRepository를 통해 대화를 생성한다.
 * 경계: Express 등 프레임워크 비의존(서비스 레이어 규칙).
 */
export class CreateConversationService {
  constructor(private repo: ConversationRepository) {}

  /**
   * 대화 생성 유스케이스 실행
  * @param ownerUserId 소유 사용자 ID(정수)
  * @param title 대화 제목(공백만 전달 시 ValidationError)
  * @returns 생성된 Conversation 엔티티
  * @throws {ValidationError} VALIDATION_FAILED — 제목 누락/공백만 포함, 재시도 무의미
  * @example
  * const conv = await service.exec(1, 'Project A');
   */
  async exec(ownerUserId: number, title: string): Promise<Conversation> {
    if (!title || !title.trim()) throw new ValidationError("Title is required");
    return this.repo.create(ownerUserId, title.trim());
  }
}
