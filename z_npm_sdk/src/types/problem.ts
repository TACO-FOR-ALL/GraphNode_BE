/**
 * RFC 9457 Problem Details (에러 응답)
 * @public
 * @property type 문제 유형 URI
 * @property title 문제 제목
 * @property status HTTP 상태 코드
 * @property detail 문제 상세 설명
 * @property instance 문제 발생 리소스 URI
 * @property correlationId 요청 추적 ID
 * @property errors 세부 에러 목록 (선택)
 * @property retryable 재시도 가능 여부 (선택)
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  correlationId?: string;
  errors?: Array<Record<string, unknown>>;
  retryable?: boolean;
}

/**
 * 플랜 한도 초과 문제 응답 DTO입니다.
 *
 * 플랜 한도를 초과했을 때 HTTP 402 Payment Required로 반환됩니다.
 * 백엔드 에러 클래스: PlanLimitExceededError.
 *
 * @public
 */
export interface PlanLimitExceededProblemDetails extends ProblemDetails {
  type: 'https://graphnode.dev/problems/plan-limit-exceeded';
  title: 'PLAN LIMIT EXCEEDED';
  status: 402;
  retryable: false;
}
