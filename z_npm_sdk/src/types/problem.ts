/** RFC 9457 Problem Details (요약형) */
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
