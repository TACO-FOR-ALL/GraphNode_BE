
import type { Request } from 'express';

import { AuthError } from '../../shared/errors/domain';

/**
 * 요청 req의 Session을 express-session.d.ts의 SessionData 타입으로 간주하고,
 * SessionData의 userId 필드의 값을 저장해주는 util 메서드
 * @param req Express Request 객체
 * @param userId 저장할 사용자 ID
 */
export function bindUserIdToSession(req: Request, userId: string): void {
  (req.session as any).userId = userId;
}


/**
 * 요청 req에서 userId를 찾아 반환하는 메서드.
 * @param req Express Request 객체
 * @returns {string} 저장된 사용자 ID
 * @throws {AuthError} 사용자 ID가 요청에 없을 경우.
 */
export function getUserIdFromRequest(req: Request) : string {
    const userId = req.userId || (req.session?.userId ? String(req.session.userId) : undefined);

    if (userId) {
        return userId;
    }

    throw new AuthError('Authentication required. User ID is missing from the request.');
}
