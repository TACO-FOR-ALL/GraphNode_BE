/**
 * 모듈: Tool 실행 컨텍스트 (Tool Execution Context)
 *
 * 책임:
 * - Vercel AI SDK tool execute() 내부에서 필요한 외부 의존성 (S3, API Key 등)을 
 *   팩토리 패턴으로 주입받기 위한 컨텍스트 인터페이스를 정의합니다.
 *
 * 배경:
 *   Vercel AI SDK tool()의 execute()는 순수 함수 형태여서 직접 외부 의존을 가질 수 없습니다.
 *   createGraphNodeTools(ctx) 팩토리를 통해 클로저로 컨텍스트를 캡처합니다.
 */

import { StoragePort } from '../../core/ports/StoragePort';

/**
 * tool execute()가 공유하는 런타임 컨텍스트
 *
 * @param storageAdapter  이미지 생성 결과를 S3에 저장하기 위한 스토리지 어댑터
 * @param openaiApiKey    DALL-E 3 이미지 생성에 사용할 OpenAI API 키
 * @param tavilyApiKey    Tavily 웹 검색 API 키 (미설정 시 빈 결과 반환)
 */
export interface ToolExecutionContext {
  storageAdapter: StoragePort;
  openaiApiKey: string;
  tavilyApiKey?: string;
}
