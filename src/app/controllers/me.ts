import type { Request, Response, NextFunction } from 'express';

import { getUserIdFromRequest } from '../utils/request';
import { UserService } from '../../core/services/UserService';
import { MeResponseDto } from '../../shared/dtos/me';

/**
 * /v1/me 엔드포인트의 컨트롤러 클래스.
 */
export class MeController {
  /**
   * @param userService 사용자 관련 비즈니스 로직을 처리하는 서비스
   */
  constructor(private readonly userService: UserService) {}

  /**
   * GET /v1/me - 현재 로그인된 사용자의 정보를 반환합니다.
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const userProfile = await this.userService.getUserProfile(userId);

      const body: MeResponseDto = {
        userId: userProfile.id,
        profile: userProfile,
      };

      res.status(200).json(body);
    } catch (e) {
      next(e);
    }
  }
}
