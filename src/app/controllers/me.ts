/**
 * 모듈: /v1/me 컨트롤러
 * 책임: 현재 로그인 상태 확인 응답.
 */
import type { Request, Response, NextFunction } from 'express';

import type { MeResponseDto, UserProfileDto } from '../../shared/dtos/me';
import { AuthError } from '../../shared/errors/domain';

/**
 * GET /v1/me — 세션 기반으로 인증 상태 반환
 */
export function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    if (userId) {
      const body: MeResponseDto = { userId };
      const profCookie = (req as any).cookies?.['gn-profile'];
      if (profCookie) {
        try {
          const decoded = JSON.parse(Buffer.from(profCookie, 'base64url').toString('utf8')) as UserProfileDto;
          body.profile = decoded;
        } catch {
          // ignore parse errors
        }
      }
      return res.status(200).json(body);
    }
    throw new AuthError('Authentication required');
  } catch (e) {
    next(e);
  }
}
