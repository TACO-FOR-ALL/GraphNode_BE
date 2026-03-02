/**
 * Sentry 초기화 전용 엔트리포인트.
 * - 이 파일은 다른 어떤 모듈(특히 Express)보다 먼저 로드되어야 합니다.
 */
import { initSentry } from './sentry';

initSentry();
