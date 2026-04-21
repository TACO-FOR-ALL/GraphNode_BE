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
   * @returns {Promise<HttpResponse<SearchNotesAndAIChatsResponse>>} 검색 결과 (snippet 포함)
   *
   * @description
   * MongoDB `$regex`를 사용한 case-insensitive 부분 일치 검색입니다.
   * 결과는 updatedAt 내림차순(최신 수정순)으로 정렬됩니다.
   *
   * - `notes`: 제목 또는 내용에 키워드가 포함된 노트 목록
   *   - 각 항목은 content 전문 대신 키워드 주변 snippet만 포함합니다.
   * - `chatThreads`: 제목 또는 메시지 내용에 키워드가 포함된 대화 목록
   *   - 각 항목은 messages 배열 대신 단일 snippet 문자열만 포함합니다.
   *   - 제목 매칭: 마지막 메시지의 첫 문장 / 메시지 매칭: 키워드 포함 문장 부분
   *
   * @example
   * const response = await client.search.integratedSearchByKeyword('회의록');
   *
   * if (response.isSuccess) {
   *   const { notes, chatThreads } = response.data;
   *   notes.forEach(n => console.log(`[노트] ${n.title} — ${n.snippet}`));
   *   chatThreads.forEach(t => console.log(`[대화] ${t.title} — ${t.snippet}`));
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
