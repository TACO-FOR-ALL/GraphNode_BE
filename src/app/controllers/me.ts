import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { getUserIdFromRequest } from '../utils/request';
import { UserService } from '../../core/services/UserService';
import { MeResponseDto, ApiKeyModel } from '../../shared/dtos/me';
import { ValidationError } from '../../shared/errors/domain';

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

  /**
   * GET /v1/me/api-keys/:model - 현재 로그인된 사용자의 API Key를 반환합니다.
   */
  async getApiKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const { model } = req.params;

      // TODO: 프론트에서도 모델 검증 필요함
      if (model !== 'openai' && model !== 'deepseek') {
        throw new ValidationError('Model must be either "openai" or "deepseek".');
      }

      const apiKey = await this.userService.getApiKeys(userId, model as ApiKeyModel);
      res.status(200).json(apiKey);
    } catch (e) {
      next(e);
    }
  }

  /**
   * PATCH /v1/me/api-keys/:model - API Key를 설정/업데이트합니다.
   */
  async updateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const { model } = req.params;

      // 모델 검증
      if (model !== 'openai' && model !== 'deepseek') {
        throw new ValidationError('Model must be either "openai" or "deepseek".');
      }

      // 요청 바디 검증
      const schema = z.object({
        apiKey: z.string().min(1, 'API Key is required'),
      });
      const data = schema.parse(req.body);

      await this.userService.updateApiKey(userId, model as ApiKeyModel, data.apiKey);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * DELETE /v1/me/api-keys/:model - API Key를 삭제합니다.
   */
  async deleteApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const { model } = req.params;

      // 모델 검증
      if (model !== 'openai' && model !== 'deepseek') {
        throw new ValidationError('Model must be either "openai" or "deepseek".');
      }

      await this.userService.deleteApiKey(userId, model as ApiKeyModel);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }
}
