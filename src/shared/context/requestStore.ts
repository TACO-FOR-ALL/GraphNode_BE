import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context stored per incoming HTTP request via AsyncLocalStorage.
 */
export type RequestContext = {
  correlationId: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  // future: add roles, clientId, headers snapshot, etc.
};

export const requestStore = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestStore.getStore();
}


/**
 * Retrieves the correlation ID from the current request context.
 * @returns The correlation ID, or undefined if not in a request scope.
 */
export function getCorrelationId(): string | undefined {
  return getRequestContext()?.correlationId;
}