import type { Request } from 'express';

import { AuthError } from '../../shared/errors/domain';

/**
 * 요청 req에 userId를 바인딩하는 메서드 (JWT 미들웨어 등에서 사용)
 * @param req Express Request 객체
 * @param userId 저장할 사용자 ID
 */
export function bindUserIdToRequest(req: Request, userId: string): void {
  req.userId = userId;
}

/**
 * 요청 req에서 userId를 찾아 반환하는 메서드.
 * JWT 미들웨어(authJwt)가 토큰 검증 후 req.userId에 설정한 값을 반환합니다.
 *
 * @param req Express Request 객체
 * @returns {string} 저장된 사용자 ID
 * @throws {AuthError} 사용자 ID가 요청에 없을 경우 (미인증 상태).
 */
export function getUserIdFromRequest(req: Request): string {
  if (req.userId) {
    return req.userId;
  }

  throw new AuthError('Authentication required. User ID is missing from the request.');
}
