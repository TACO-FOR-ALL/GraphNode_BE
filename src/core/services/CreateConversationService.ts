/**
 * 모듈: CreateConversationService
 * 책임
 * - 입력 검증 후 ConversationRepository를 통해 대화를 생성한다.
 * 외부 의존: 없음(리포지토리 포트에만 의존). Express 등 프레임워크 비의존.
 * 공개 인터페이스: CreateConversationService.exec
 * 로깅: 실제 로깅은 상위 계층에서 수행. 본 서비스는 예외만 throw.
 */
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
  * @description
  * - 현재 V2 계약 이행을 위해 Repository.create의 입력 형태에 맞춰 임시 값을 구성한다.
  * - 실제 구현에서는 FE로부터 V2 DTO 입력을 직접 전달받아 사용한다.
  * @param ownerUserId 소유 사용자 ID(정수)
  * @param title 대화 제목(공백만 전달 시 ValidationError)
  * @returns 생성된 Conversation 엔티티(도메인 모델)
  * @throws {ValidationError} VALIDATION_FAILED — 제목 누락/공백만 포함(재시도 무의미)
  * @example
  * const conv = await service.exec(1, 'Project A');
  * @remarks
  * - 멱등성: 현재 서비스는 멱등성을 보장하지 않는다. 클라이언트에서 Idempotency-Key를 제공하는 상위 API에서 보장할 수 있다.
  * - 시각: now는 서버 시계로 결정되어 저장 계층에서 재정의될 수 있다.
   */
  async exec(ownerUserId: number, title: string): Promise<Conversation> {
    if (!title || !title.trim()) throw new ValidationError("Title is required");
    // TODO(feature_ConversationAI): FE가 V2 DTO로 대화 생성 요청을 전달하면 해당 형태로 서비스 입력을 재정의한다.
    // 임시: 시그니처 변경에 맞춘 스텁 입력(실제 구현 시 제거)
    const now = new Date().toISOString();
    return this.repo.create({
      id: 'TEMP_ID', // 실제 구현 시 UUID/ULID 생성
      ownerUserId,
      provider: 'unknown',
      model: 'unknown',
      title: title.trim(),
      source: 'api',
      createdAt: now,
      updatedAt: now,
      tags: [],
    });
  }
}
