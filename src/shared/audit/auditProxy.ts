import { logger } from '../utils/logger';
import { requestStore, RequestContext } from '../context/requestStore';

function maskValue(v: any): any {
  if (v == null) return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(maskValue);
  if (typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (/password|token|secret|access|authorization/i.test(k)) out[k] = '***REDACTED***';
      else if (typeof val === 'object') out[k] = summarizeArg(val);
      else out[k] = val;
    }
    return out;
  }
  return String(v);
}

function summarizeArg(arg: any) {
  if (arg == null) return null;
  if (Array.isArray(arg)) return { type: 'array', length: arg.length };
  if (typeof arg === 'object') return { type: 'object', keys: Object.keys(arg).slice(0, 10) };
  return arg;
}

function summarizeArgs(args: any[]): any[] {
  try {
    return args.map(a => (typeof a === 'object' ? summarizeArg(a) : a));
  } catch {
    return ['<unserializable>'];
  }
}

function summarizeResult(res: any) {
  if (res == null) return null;
  if (Array.isArray(res)) return { type: 'array', length: res.length };
  if (typeof res === 'object') return { type: 'object', keys: Object.keys(res).slice(0, 10) };
  return res;
}

/**
 * Wrap an object (service instance) with a Proxy that audits method calls.
 * Logs a summary-only audit record: service, method, args-summary, duration, success flag, user/context.
 */
export function createAuditProxy<T extends object>(instance: T, serviceName?: string): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function') return orig;

      return async function auditWrapper(this: any, ...args: any[]) {
        const start = Date.now();
        const ctx: RequestContext | undefined = requestStore.getStore();
        const meta = {
          service: serviceName ?? (target as any).constructor?.name ?? 'UnknownService',
          method: String(prop),
          correlationId: ctx?.correlationId,
          userId: ctx?.userId,
          ip: ctx?.ip,
        };

        // log invocation (summary only)
        try {
          logger.info({ event: 'audit.call', ...meta, args: summarizeArgs(args) }, 'audit.call');
        } catch (_) {}

        try {
          const result = await orig.apply(this, args);
          const durationMs = Date.now() - start;
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
          try {
            logger.error({
              event: 'audit.error',
              ...meta,
              durationMs,
              error: err?.message ?? String(err),
            }, 'audit.error');
          } catch (_) {}
          throw err;
        }
      };
    },
  });
}
