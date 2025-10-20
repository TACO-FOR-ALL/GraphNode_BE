/**
 * 모듈: AI 대화 도큐먼트 모델 (영속 계층)
 * 책임
 * - MongoDB 등 영속 계층에서 사용하는 Conversation/Message 도큐먼트 타입을 정의한다.
 * 외부 의존: 없음(타입 전용)
 * 공개 인터페이스: ConversationDoc, MessageDoc
 * 주의
 * - 날짜는 Date로 유지하여 인덱스/쿼리 연산에 유리하게 한다.
 */
import type { ContentBlock, MessageRole, Provider, Source } from '../../../shared/dtos/ai';

/** Conversation 도큐먼트 스키마(저장 전용) 
 * - 컬렉션: conversations
 * - 커서: _id 문자열을 opaque 커서로 사용(정렬: _id ASC)
 * @param _id 내부 식별자(UUID/ULID). DB 기본 키 문자열
 * @param ownerUserId 소유 사용자 ID(정수)
 * @param provider AI 공급자 식별자
 * @param model 모델 문자열(벤더 명명 그대로)
 * @param title 제목(선택)
 * @param source 데이터 원천(선택)
 * @param createdAt Date 객체 생성 시각
 * @param updatedAt Date 객체 수정 시각
 * @param tags 태그 배열(선택)
*/
export interface ConversationDoc {
  /** 내부 식별자(_id). DB 기본 키 문자열 */
  _id: string;
  ownerUserId: number;
  provider: Provider;
  model: string;
  title?: string | null;
  source?: Source;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

/** Message 도큐먼트 스키마(저장 전용) 
 * - 컬렉션: messages
 * - 커서: _id 문자열 기준 ASC 페이징
 * @param _id 내부 식별자(UUID/ULID). DB 기본 키 문자열
 * @param conversationId 소속 대화 ID(UUID/ULID)
 * @param role 메시지 역할
 * @param content 컨텐츠 블록 배열
 * @param createdAt Date 객체 생성 시각
 * @param updatedAt Date 객체 수정 시각
*/
export interface MessageDoc {
  /** 내부 식별자(_id). DB 기본 키 문자열 */
  _id: string;
  conversationId: string;
  role: MessageRole;
  content: ContentBlock[];
  createdAt: Date;
  updatedAt: Date;
}
