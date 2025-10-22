
import type { Request } from 'express';
import type { SessionData } from 'express-session';

/**
 * 요청 req의 Session을 express-session.d.ts의 SessionData 타입으로 간주하고,
 * SessionData의 userId 필드의 값을 저장해주는 util 메서드
 * @param req Express Request 객체
 * @param userId 저장할 사용자 ID
 */
export function bindUserIdToSession(req: Request, userId: string): void {
  (req.session as SessionData).userId = userId;
}


/**
 * 요청 req에서 userId를 찾아 반환을 시도하는 메서드
 * @param req Express Request 객체
 * @return userId 저장된 사용자 id
 */
export function getUserIdFromRequest(req: Request) : string | undefined {
    if (req.userId) return req.userId;

    return req.session?.userId ? String(req.session.userId) : undefined;
}
