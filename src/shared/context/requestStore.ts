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
