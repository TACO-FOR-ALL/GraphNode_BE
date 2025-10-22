/**
 * 모듈: AI 대화 데이터 공통 DTO 집합
 * 책임
 * - FE-BE 간 AI 대화 데이터 교환을 위한 표준 DTO를 정의한다.
 * - 이 DTO는 FE에서 제공하는 `ChatThread`와 `ChatMessage` 양식을 따른다.
 * 외부 의존: 없음(순수 타입 모듈).
 * 공개 인터페이스: ChatRole, ChatMessage, ChatThread
 */

/**
 * 메시지 역할.
 * @public
 */
export type ChatRole = "user" | "assistant" | "system";

/**
 * FE-BE간 채팅 메시지 DTO
 * @param id 메시지 ID
 * @param role 메시지 역할
 * @param content 메시지 내용
 * @param ts 메시지 타임스탬프 (ISO 8601)
 */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  ts?: string; // ISO 8601
}

/**
 * FE-BE간 채팅 스레드 DTO
 * @param id 대화 ID
 * @param title 대화 제목
 * @param updatedAt 마지막 업데이트 시각 (ISO 8601)
 * @param messages 메시지 목록
 */
export interface ChatThread {
  id: string;
  title: string;
  updatedAt?: string; // ISO 8601
  messages: ChatMessage[];
}

// /**
//  * FE에서 제공하는 채팅 메시지 내용의 기본 구조.
//  * @public
//  */
// export type ContentBlock = {
//   type: "text";
//   text: string;
// };

