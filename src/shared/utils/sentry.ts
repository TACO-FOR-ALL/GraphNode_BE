/**
 * 모듈: Sentry 설정 및 유틸리티
 *
 * 책임:
 * - Sentry SDK를 초기화합니다. (DSN, 환경 설정, 성능 모니터링)
 * - Express 앱에서 사용할 에러 핸들러 설정 함수를 제공합니다.
 * - 민감한 정보(PII)가 Sentry로 전송되지 않도록 필터링(Data Scrubbing)합니다.
 *
 * ⚠️  captureException 단일 전송 원칙:
 *     실제 Sentry 이벤트 전송(captureException)은 src/app/middlewares/error.ts의
 *     errorHandler에서만 수행합니다. setupSentryErrorHandler는 span/transaction
 *     마킹 전용이며 shouldHandleError: () => false로 이중 전송을 차단합니다.
 *     설계 배경: docs/architecture/sentry.md 섹션 8, docs/architecture/ERRORS.md 섹션 4
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
    tracesSampleRate: (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') ? 0.1 : 1.0,
    // 프로파일링 샘플링 비율
    profilesSampleRate: 1.0,

    // 전송 전 데이터 정제 (Data Scrubbing)
    beforeSend(event) {
      // 요청 헤더 민감 정보 제거
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // error_details context 크기 제한 (errorHandler에서 주입한 context)
      // 상세 규격: docs/architecture/sentry.md 섹션 8.4
      const details = event.contexts?.['error_details'];
      if (details != null && typeof details === 'object') {
        const d = details as Record<string, unknown>;

        // cause: 500자 초과 시 truncation (MongoServerError 등 장문 DB 에러 대비)
        if (typeof d['cause'] === 'string' && d['cause'].length > 500) {
          d['cause'] = d['cause'].slice(0, 500) + '…(truncated)';
        }

        // details 객체: 2KB 초과 시 키 목록만 보존 (ValidationError issues 배열 등 대비)
        if (d['details'] != null && typeof d['details'] === 'object') {
          if (JSON.stringify(d['details']).length > 2048) {
            d['details'] = {
              _truncated: true,
              keys: Object.keys(d['details'] as object),
            };
          }
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
 *
 * ⚠️  shouldHandleError: () => false
 *     실제 captureException은 errorHandler(error.ts)에서 단독으로 수행합니다.
 *     이유: errorHandler에서만 withScope로 tag/context를 주입하고 event id를 회수하여
 *     CloudWatch 로그에 sentryEventId를 남길 수 있습니다.
 *     setupExpressErrorHandler를 완전히 제거하지 않는 이유: Sentry가 현재 span/transaction에
 *     에러 상태(status: internal_error)를 자동 마킹하는 tracing 연결 기능을 유지하기 위함입니다.
 */
export function setupSentryErrorHandler(app: Express) {
  Sentry.setupExpressErrorHandler(app, {
    // captureException은 errorHandler에서 단독 수행 → 이중 전송 방지
    shouldHandleError: () => false,
  });
}

