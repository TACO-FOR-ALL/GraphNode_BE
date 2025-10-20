/**
 * 모듈: AI 대화 DTO↔Doc 매퍼
 * 책임
 * - Transport DTO(RFC3339 문자열 시간)와 Persistence Doc(Date 객체) 간 변환을 담당한다.
 * 외부 의존: 없음
 * 공개 인터페이스: toConversationDoc, toConversationDto, toMessageDoc, toMessageDto
 * 에러 전략: 잘못된 시각 포맷 등은 ValidationError 대신 RangeError를 throw(상위에서 AppError 매핑).
 */
import type { ConversationV2Dto, MessageV2Dto } from '../dtos/ai';
import type { ConversationDoc, MessageDoc } from '../../infra/db/models/ai';

/**
 * RFC3339 문자열을 Date로 변환.
 * @param s RFC3339 문자열(UTC)
 * @returns Date 인스턴스
 * @throws {RangeError} 유효하지 않은 날짜 문자열일 때
 */
function parseRfc3339ToDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid RFC3339 datetime: ${s}`);
  return d;
}

/**
 * Date를 RFC3339(UTC) 문자열로 변환.
 * @param d Date
 * @returns RFC3339 문자열
 */
function formatDateToRfc3339(d: Date): string {
  return d.toISOString();
}

/**
 * ConversationV2Dto → ConversationDoc 변환.
 * @param dto Conversation V2 DTO
 * @returns ConversationDoc
 * @throws {RangeError} createdAt/updatedAt 포맷 오류 시
 * @example
 * const doc = toConversationDoc(dto);
 */
export function toConversationDoc(dto: ConversationV2Dto): ConversationDoc {
  return {
    _id: dto.id,
    ownerUserId: dto.ownerUserId,
    provider: dto.provider,
    model: dto.model,
    title: dto.title,
    source: dto.source,
    createdAt: parseRfc3339ToDate(dto.createdAt),
    updatedAt: parseRfc3339ToDate(dto.updatedAt),
    tags: dto.tags,
  };
}

/**
 * ConversationDoc → ConversationV2Dto 변환.
 * @param doc Conversation 도큐먼트
 * @returns ConversationV2Dto
 * @example
 * const dto = toConversationDto(doc);
 */
export function toConversationDto(doc: ConversationDoc): ConversationV2Dto {
  return {
    id: doc._id,
    ownerUserId: doc.ownerUserId,
    provider: doc.provider,
    model: doc.model,
    title: doc.title,
    source: doc.source,
    createdAt: formatDateToRfc3339(doc.createdAt),
    updatedAt: formatDateToRfc3339(doc.updatedAt),
    tags: doc.tags,
  };
}

/**
 * MessageV2Dto → MessageDoc 변환.
 * @param dto Message V2 DTO
 * @returns MessageDoc
 * @throws {RangeError} createdAt/updatedAt 포맷 오류 시
 */
export function toMessageDoc(dto: MessageV2Dto): MessageDoc {
  return {
    _id: dto.id,
    conversationId: dto.conversationId,
    role: dto.role,
    content: dto.content,
    createdAt: parseRfc3339ToDate(dto.createdAt),
    updatedAt: parseRfc3339ToDate(dto.updatedAt),
  };
}

/**
 * MessageDoc → MessageV2Dto 변환.
 * @param doc Message 도큐먼트
 * @returns MessageV2Dto
 */
export function toMessageDto(doc: MessageDoc): MessageV2Dto {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    role: doc.role,
    content: doc.content,
    createdAt: formatDateToRfc3339(doc.createdAt),
    updatedAt: formatDateToRfc3339(doc.updatedAt),
  };
}
