import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { getUserIdFromRequest } from '../utils/request';
import { UserService } from '../../core/services/UserService';
import {
  MeResponseDto,
  ApiKeyModel,
  OnboardingOccupation,
  OnboardingAgentMode,
} from '../../shared/dtos/me';
import { verifyToken } from '../utils/jwt';
import {
  listSessions,
  removeSessionBySessionId,
} from '../../infra/redis/SessionStoreRedis';
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



      await this.userService.deleteApiKey(userId, model as ApiKeyModel);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }
  /**
   * GET /v1/me/openai-assistant-id
   */
  async getOpenAiAssistantId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const assistantId = await this.userService.getOpenAiAssistantId(userId);
      res.status(200).json({ assistantId });
    } catch (e) {
      next(e);
    }
  }

  /**
   * PATCH /v1/me/openai-assistant-id
   */
  async updateOpenAiAssistantId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const schema = z.object({
        assistantId: z.string().min(1, 'Assistant ID is required'),
      });
      const data = schema.parse(req.body);

      await this.userService.updateOpenAiAssistantId(userId, data.assistantId);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * GET /v1/me/preferred-language
   */
  async getPreferredLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const language = await this.userService.getPreferredLanguage(userId);
      res.status(200).json({ language });
    } catch (e) {
      next(e);
    }
  }

  /**
   * PATCH /v1/me/preferred-language
   */
  async updatePreferredLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const schema = z.object({
        language: z.string().min(1).max(10),
      });
      const data = schema.parse(req.body);

      await this.userService.updatePreferredLanguage(userId, data.language);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * GET /v1/me/onboarding
   */
  async getOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const onboarding = await this.userService.getOnboarding(userId);
      res.status(200).json(onboarding);
    } catch (e) {
      next(e);
    }
  }

  /**
   * PATCH /v1/me/onboarding
   */
  async updateOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const schema = z.object({
        occupation: z.enum([
          'developer',
          'student',
          'entrepreneur',
          'researcher',
          'creator',
          'other',
        ] as const),
        interests: z.array(z.string().trim().min(1).max(40)).max(10),
        agentMode: z.enum(['formal', 'friendly', 'casual'] as const),
      });
      const data = schema.parse(req.body);

      await this.userService.updateOnboarding(userId, {
        occupation: data.occupation as OnboardingOccupation,
        interests: data.interests,
        agentMode: data.agentMode as OnboardingAgentMode,
      });
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * GET /v1/me/sessions — 내 계정의 활성 세션 목록 조회
   * - createdAt: 세션 생성 시각 (ISO 8601)
   * - isCurrent: 현재 요청 기기와 동일한 세션 여부
   */
  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const rows = await listSessions(userId);
      const currentSessionId = this.getSessionIdFromRequest(req);

      res.status(200).json({
        sessions: rows.map((row) => ({
          sessionId: row.sessionId,
          createdAt: row.createdAt,
          isCurrent: !!currentSessionId && currentSessionId === row.sessionId,
        })),
      });
    } catch (e) {
      next(e);
    }
  }

  /**
   * DELETE /v1/me/sessions/:sessionId — 특정 세션(기기) 강제 로그아웃
   * - sessionId 형식 검증: 16자 hex
   * - 없는 세션도 204 반환 (idempotent, 클라이언트 재시도에 안전)
   */
  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserIdFromRequest(req)!;
      const { sessionId } = req.params;
      if (!/^[a-f0-9]{16}$/.test(sessionId)) {
        throw new ValidationError('Invalid sessionId format');
      }

      await removeSessionBySessionId(userId, sessionId);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 현재 요청에서 Access Token의 sessionId를 추출
   * - Authorization 헤더 또는 signed cookie에서 토큰 획득 후 디코딩
   */
  private getSessionIdFromRequest(req: Request): string | null {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : req.signedCookies?.['access_token'];
      if (!token) return null;
      const payload = verifyToken(token);
      return payload.sessionId ?? null;
    } catch {
      return null;
    }
  }
}
