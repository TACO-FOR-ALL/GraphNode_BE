/**
 * 사용자 라이브러리 파일 AI 요약의 구조화 저장 형태.
 * Mongo `user_files.summaryStructured` 및 API 응답과 동기화합니다.
 */
export interface UserFileSummaryStructured {
  /** 1. 한 줄 요약 (미리보기·`UserFileDto.summary`와 동일 값) */
  oneLine: string;
  /** 2. 문서의 목적/주제 */
  purpose: string;
  /** 3. 핵심 포인트 (3~5개 권장) */
  keyPoints: string[];
  /** 4. 결론 및 시사점 */
  conclusion: string;
}
