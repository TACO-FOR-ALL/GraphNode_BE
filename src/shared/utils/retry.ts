import retry from 'async-retry';
import { logger } from './logger';

/**
 * 재시도 정책 옵션 인터페이스
 */
export interface RetryOptions extends retry.Options {
  /** 재시도 시 로그에 남길 태그/컨텍스트 */
  label?: string;
}

/**
 * 비동기 함수에 대해 재시도 로직을 적용하는 표준 래퍼 함수입니다.
 * exponential backoff와 jitter를 지원합니다.
 * 
 * @param fn 재시도할 비동기 함수
 * @param options async-retry 옵션 및 커스텀 옵션
 * @returns 함수의 결과값
 * 
 * @example
 * const result = await withRetry(async () => {
 *   return await externalApi.call();
 * }, { retries: 3, label: 'ExternalApiCall' });
 */
export async function withRetry<T>(
  fn: (bail: (e: Error) => void, attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { label = 'AsyncOperation', ...retryOptions } = options;

  // 기본값 설정 (매핑 계획서 기반)
  const finalOptions: retry.Options = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 5000,
    randomize: true,
    onRetry: (error, attempt) => {
      logger.warn(
        { err: error, attempt, label },
        `Retrying ${label} due to transient error (attempt ${attempt})`
      );
    },
    ...retryOptions,
  };

  return retry(fn, finalOptions);
}
