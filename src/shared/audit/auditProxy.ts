/**
 * 모듈: Audit Proxy (감사 로그 프록시)
 * 
 * 책임:
 * - 서비스 객체의 메서드 호출을 가로채서(Intercept) 감사 로그(Audit Log)를 남깁니다.
 * - 누가(User), 언제(Time), 무엇을(Method), 어떤 값으로(Args) 호출했는지 기록합니다.
 * - 민감한 정보(비밀번호, 토큰 등)는 마스킹(Masking)하여 로그에 남지 않도록 합니다.
 * - 메서드 실행 시간(Duration)을 측정하여 성능 모니터링을 돕습니다.
 */

import { logger } from '../utils/logger';
import { requestStore, RequestContext } from '../context/requestStore';

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
    return args.map(a => (typeof a === 'object' ? summarizeArg(a) : a));
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
      return async function auditWrapper(this: any, ...args: any[]) {
        const start = Date.now();
        // 현재 요청 컨텍스트(사용자 정보 등) 가져오기
        const ctx: RequestContext | undefined = requestStore.getStore();
        const meta = {
          service: serviceName ?? (target as any).constructor?.name ?? 'UnknownService',
          method: String(prop),
          correlationId: ctx?.correlationId,
          userId: ctx?.userId,
          ip: ctx?.ip,
        };

        // 1. 호출 로그 (요약된 인자 포함)
        try {
          logger.info({ event: 'audit.call', ...meta, args: summarizeArgs(args) }, 'audit.call');
        } catch (_) {}

        try {
          // 2. 실제 메서드 실행
          const result = await orig.apply(this, args);
          const durationMs = Date.now() - start;
          
          // 3. 성공 로그
          try {
            logger.info({
              event: 'audit.success',
              ...meta,
              durationMs,
              result: summarizeResult(result),
            }, 'audit.success');
          } catch (_) {}
          return result;
        } catch (err: any) {
          const durationMs = Date.now() - start;
          
          // 4. 에러 로그
          try {
            logger.error({
              event: 'audit.error',
              ...meta,
              durationMs,
              error: err?.message ?? String(err),
            }, 'audit.error');
          } catch (_) {}
          throw err; // 에러를 다시 던져서 상위에서 처리하게 함
        }
      };
    },
  });
}
