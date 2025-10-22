/**
 * 모듈: 공통 DTO (Problem Details)
 * 책임
 * - RFC 9457 Problem Details 스키마를 코드 타입으로 제공한다.
 * 외부 의존: 없음(순수 타입)
 * 공개 인터페이스: ProblemDetails
 * 로깅: 응답 변환 미들웨어에서 correlationId를 포함시킨다(본 타입에는 필드만 정의).
 */
/**
 * Problem Details(에러 응답) DTO.
 * - RFC 9457 필수/확장 필드를 포함한다.
 * - 모든 에러 응답은 Content-Type: application/problem+json 으로 본 스키마를 따른다.
 * @remarks
 * - type은 사내 레지스트리 URI(https://graphnode.dev/problems/...)를 권장한다.
 * - errors 필드는 하위 문제(필드별 오류 등)를 배열로 제공한다.
 */
export interface ProblemDetails {
  /** 문제 유형 URI(내부 레지스트리) */
  type: string;
  /** 짧은 제목(사람 친화) */
  title: string;
  /** HTTP 상태코드(100~599) */
  status: number;
  /** 상세 설명(사용자용 요약) */
  detail: string;
  /** 문제 발생 리소스 경로 */
  instance: string;
  /** 상관관계 ID(trace_id) */
  correlationId?: string;
  /** 재시도 가능 여부(서버 판단) */
  retryable?: boolean;
  /** 하위 문제 목록(필드 단위 등) */
  errors?: Array<Record<string, unknown>>;
}
