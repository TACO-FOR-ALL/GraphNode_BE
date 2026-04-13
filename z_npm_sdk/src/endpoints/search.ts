import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { 
  SearchNotesAndAIChatsResponse
} from '../types/search.js';

/**
 * 모듈: SearchApi
 * 책임: 노트 및 AI 대화 통합 키워드 검색 기능을 제공합니다.
 * 
 * 주요 기능:
 * - 노트 및 AI 대화(메시지 포함) 통합 키워드 검색 (`integratedSearchByKeyword`)
 * 
 * @public
 */
export class SearchApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 노트 및 AI 대화(채팅 스레드)에 대해 통합 키워드 검색을 수행합니다.
   * 
   * @param q 검색할 키워드 (예: "프로젝트", "회의록")
   * @returns {Promise<HttpResponse<SearchNotesAndAIChatsResponse>>} 검색 결과 (관련도 점수 포함)
   * 
   * @description
   * 이 메서드는 사용자의 모든 노트와 AI 채팅 메시지를 대상으로 키워드 매칭 검색을 수행합니다.
   * 결과는 MongoDB의 `textScore`를 기반으로 연관성이 높은 순서대로 정렬되어 반환됩니다.
   * - `notes`: 제목 또는 내용에 키워드가 포함된 노트 목록
   * - `chatThreads`: 메시지 내용에 키워드가 포함된 대화 스레드 목록 (대화 내의 메시지 점수를 합산하여 스레드 단위로 정렬)
   * 
   * @example
   * const response = await client.search.integratedSearchByKeyword('회의록');
   * 
   * if (response.isSuccess) {
   *   const { notes, chatThreads } = response.data;
   *   console.log('Notes (Sorted by Score):', notes);
   *   console.log('Chat Threads (Sorted by Score):', chatThreads);
   * }
   * 
   * @throws 400 - 검색어가 누락되었을 때
   * @throws 401 - 인증되지 않은 사용자일 때
   */
  async integratedSearchByKeyword(q: string): Promise<HttpResponse<SearchNotesAndAIChatsResponse>> {
    return this.rb
      .path('/v1/search')
      .query({ q })
      .get<SearchNotesAndAIChatsResponse>();
  }
}
