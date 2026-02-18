/**
 * 모듈: Sentry 설정 및 유틸리티
 *
 * 책임:
 * - Sentry SDK를 초기화합니다. (DSN, 환경 설정, 성능 모니터링)
 * - Express 앱에서 사용할 에러 핸들러 설정 함수를 제공합니다.
 * - 민감한 정보(PII)가 Sentry로 전송되지 않도록 필터링(Data Scrubbing)합니다.
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { Express } from 'express';

/**
 * Sentry 초기화 함수
 * - 애플리케이션 시작 최상단(index.ts)에서 호출되어야 합니다.
 */
export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      // HTTP 요청 추적 (v8: 함수형 통합)
      Sentry.httpIntegration(),
      // Express 앱 연동 (v8: 함수형 통합 - 미들웨어/라우터 추적)
      Sentry.expressIntegration(),
      // 성능 프로파일링
      nodeProfilingIntegration(),
    ],
    // 성능 모니터링 샘플링 비율 (1.0 = 100% 전송. 프로덕션에서는 줄여야 함 예: 0.1)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // 프로파일링 샘플링 비율
    profilesSampleRate: 1.0,

    // 전송 전 데이터 정제 (Data Scrubbing)
    beforeSend(event) {
      if (event.request) {
        // 민감한 헤더 제거
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
      }
      return event;
    },
  });
}

/**
 * Sentry 에러 핸들러 설정
 * - v8부터는 app.use(handler) 대신 setupExpressErrorHandler(app) 사용
 * - 모든 라우트/미들웨어 등록 후, Global Error Handler 직전에 호출해야 함
 */
export function setupSentryErrorHandler(app: Express) {
  Sentry.setupExpressErrorHandler(app);
}

