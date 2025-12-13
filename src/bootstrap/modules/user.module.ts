/**
 * 모듈: User 컴포지션 (의존성 조립)
 * 책임: User 관련 Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { createMeRouter } from '../../app/routes/me';
import { container } from '../container';

/**
 * /v1/me 라우터와 그 의존성을 생성하여 반환합니다.
 * @returns Express 라우터
 */
export function makeMeRouter(): Router {
  const userService = container.getUserService();

  // Router (factory)
  return createMeRouter({
    userService,
  });
}
