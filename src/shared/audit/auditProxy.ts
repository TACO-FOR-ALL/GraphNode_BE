/**
 * 모듈: Audit Proxy (감사 로그 프록시)
 *
 * 책임:
 * - 서비스 객체의 메서드 호출을 가로채서(Intercept) 감사 로그(Audit Log)를 남깁니다.
 * - 누가(User), 언제(Time), 무엇을(Method), 어떤 값으로(Args) 호출했는지 기록합니다.
 * - 민감한 정보(비밀번호, 토큰 등)는 마스킹(Masking)하여 로그에 남지 않도록 합니다.
 * - 메서드 실행 시간(Duration)을 측정하여 성능 모니터링을 돕습니다.
 */

import * as Sentry from '@sentry/node';

import { logger } from '../utils/logger';
import { requestStore, RequestContext } from '../context/requestStore';
import { getPostHogClient } from '../utils/posthog';

/**
 * 민감한 정보를 마스킹하는 함수
 *
 * 역할:
 * - 객체나 배열을 순회하며 특정 키워드(password, token 등)가 포함된 필드의 값을 가립니다.
 * - 로그에 개인정보나 보안 정보가 노출되는 것을 방지합니다.
 */
function maskValue(v: any): any {
  if (v == null) return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(maskValue);
  if (typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      // 민감한 키워드 패턴 매칭
      if (/password|token|secret|access|authorization/i.test(k)) out[k] = '***REDACTED***';
      else if (typeof val === 'object') out[k] = summarizeArg(val);
      else out[k] = val;
    }
    return out;
  }
  return String(v);
}

/**
 * 인자 값을 요약하는 함수
 *
 * 역할:
 * - 로그 용량을 줄이기 위해 거대한 객체나 배열을 요약 정보로 변환합니다.
 * - 배열은 길이만, 객체는 키 목록(최대 10개)만 남깁니다.
 */
function summarizeArg(arg: any) {
  if (arg == null) return null;
  if (Array.isArray(arg)) return { type: 'array', length: arg.length };
  if (typeof arg === 'object') return { type: 'object', keys: Object.keys(arg).slice(0, 10) };
  return arg;
}

/**
 * 함수 인자 목록을 요약하는 함수
 */
function summarizeArgs(args: any[]): any[] {
  try {
    return args.map((a) => (typeof a === 'object' ? summarizeArg(a) : a));
  } catch {
    return ['<unserializable>'];
  }
}

/**
 * 함수 실행 결과를 요약하는 함수
 */
function summarizeResult(res: any) {
  if (res == null) return null;
  if (Array.isArray(res)) return { type: 'array', length: res.length };
  if (typeof res === 'object') return { type: 'object', keys: Object.keys(res).slice(0, 10) };
  return res;
}

/**
 * 서비스 객체를 감싸는 감사 로그 프록시 생성 함수
 *
 * @param instance 감쌀 대상 서비스 객체
 * @param serviceName 서비스 이름 (로그에 기록됨)
 * @returns 프록시로 감싸진 서비스 객체
 *
 * 동작 방식:
 * 1. 대상 객체의 메서드 호출을 가로챕니다 (Proxy get trap).
 * 2. 호출 전: 호출 정보(메서드명, 인자 요약, 사용자 정보 등)를 로그에 남깁니다 (audit.call).
 * 3. 실행: 실제 메서드를 실행하고 시간을 측정합니다.
 * 4. 성공 시: 결과 요약과 소요 시간을 로그에 남깁니다 (audit.success).
 * 5. 실패 시: 에러 메시지와 소요 시간을 로그에 남기고 에러를 다시 던집니다 (audit.error).
 */
export function createAuditProxy<T extends object>(instance: T, serviceName?: string): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      // 함수가 아닌 속성은 그대로 반환
      if (typeof orig !== 'function') return orig;

      // 메서드 호출을 감싸는 래퍼 함수
      return function auditWrapper(this: any, ...args: any[]) {
        const start = Date.now();
        // 현재 요청 컨텍스트(사용자 정보 등) 가져오기
        const ctx: RequestContext | undefined = requestStore.getStore();

        /**
         * SSE 등 반복 연결 경로에서 불필요한 로그를 억제하기 위한 플래그.
         * suppressNotificationLog 미들웨어가 RequestContext에 설정한다.
         * true이면 audit.call, audit.success 로그와 PostHog 이벤트를 건너뛴다.
         * 에러 로그(audit.error)는 항상 기록한다.
         * @see suppress-notification-log.ts
         */
        const suppressed = ctx?.suppressAuditLog === true;
        
        // 메타 데이터 정의
        const meta = {
          service: serviceName ?? (target as any).constructor?.name ?? 'UnknownService',
          method: String(prop),
          correlationId: ctx?.correlationId,
          userId: ctx?.userId,
          ip: ctx?.ip,
        };

        // 1. 호출 로그 (요약된 인자 포함) — 억제 모드에서는 건너뜀
        if (!suppressed) {
          try {
            logger.info({ event: 'audit.call', ...meta, args: summarizeArgs(args) }, 'audit.call');
          } catch (_) {}

          // Sentry Breadcrumb: 에러 발생 시 "어떤 서비스 메서드가 호출됐는지" 타임라인에 포함됩니다.
          // expressIntegration/withIsolationScope가 AsyncLocalStorage로 요청별 scope를 격리하므로
          // 다른 동시 요청의 breadcrumb과 섞이지 않습니다.
          try {
            Sentry.addBreadcrumb({
              type: 'default',
              category: 'audit.call',
              message: `${meta.service}.${meta.method}`,
              data: { args: summarizeArgs(args), correlationId: meta.correlationId },
              level: 'info',
            });
          } catch (_) {}
        }


        try {
          // 2. 실제 메서드 실행
          const result = orig.apply(this, args);

          // 결과가 Promise인 경우 (비동기 처리)
          if (result && typeof result.then === 'function') {
            return result
              .then((res: any) => {
                const durationMs = Date.now() - start;
                // 3. 성공 로그 — 억제 모드에서는 건너뜀
                if (!suppressed) {
                  try {
                    logger.info(
                      {
                        event: 'audit.success',
                        ...meta,
                        durationMs,
                        result: summarizeResult(res),
                      },
                      'audit.success'
                    );
                  } catch (_) {}

                  try {
                    Sentry.addBreadcrumb({
                      type: 'default',
                      category: 'audit.success',
                      message: `${meta.service}.${meta.method} (${durationMs}ms)`,
                      data: { durationMs, result: summarizeResult(res) },
                      level: 'info',
                    });
                  } catch (_) {}
                }

                return res;
              })
              .catch((err: any) => {
                const durationMs = Date.now() - start;
                // 4. 에러 로그 — 에러는 항상 기록 (억제하지 않음)
                try {
                  logger.error(
                    {
                      event: 'audit.error',
                      ...meta,
                      durationMs,
                      err,
                    },
                    'audit.error'
                  );
                } catch (_) {}

                // Sentry Breadcrumb: 에러 레벨로 기록 — 에러 직전까지의 서비스 실패 지점을 명확히 보여줍니다.
                try {
                  Sentry.addBreadcrumb({
                    type: 'error',
                    category: 'audit.error',
                    message: `${meta.service}.${meta.method} FAILED (${durationMs}ms)`,
                    data: {
                      durationMs,
                      errorMessage: err instanceof Error ? err.message : String(err),
                      errorCode: (err as any)?.code,
                    },
                    level: 'error',
                  });
                } catch (_) {}

                throw err;
              });
          }

          // 결과가 Promise가 아닌 경우 (동기 처리)
          const durationMs = Date.now() - start;
          if (!suppressed) {
            try {
              logger.info(
                {
                  event: 'audit.success',
                  ...meta,
                  durationMs,
                  result: summarizeResult(result),
                },
                'audit.success'
              );
            } catch (_) {}

            try {
              Sentry.addBreadcrumb({
                type: 'default',
                category: 'audit.success',
                message: `${meta.service}.${meta.method} (${durationMs}ms)`,
                data: { durationMs, result: summarizeResult(result) },
                level: 'info',
              });
            } catch (_) {}
          }

          return result;
        } catch (err: any) {
          // 동기 실행 중 에러 발생 — 에러는 항상 기록
          const durationMs = Date.now() - start;
          try {
            logger.error(
              {
                event: 'audit.error',
                ...meta,
                durationMs,
                err,
              },
              'audit.error'
            );
          } catch (_) {}

          try {
            Sentry.addBreadcrumb({
              type: 'error',
              category: 'audit.error',
              message: `${meta.service}.${meta.method} FAILED (${durationMs}ms)`,
              data: {
                durationMs,
                errorMessage: err instanceof Error ? err.message : String(err),
                errorCode: (err as any)?.code,
              },
              level: 'error',
            });
          } catch (_) {}

          throw err;
        }
      };

    },
  });
}
