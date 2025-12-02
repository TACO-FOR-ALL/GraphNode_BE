import { Router } from 'express';

import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { MeController } from '../controllers/me';
import { UserService } from '../../core/services/UserService';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * /v1/me 라우터를 생성하는 팩토리 함수.
 * @param deps 라우터가 의존하는 서비스들
 * @returns Express 라우터
 */
export function createMeRouter(deps: { userService: UserService }): Router {
  const router = Router();
  const meController = new MeController(deps.userService);

  router.use(bindSessionUser);
  router.use(requireLogin);

  router.get('/', asyncHandler(meController.getMe.bind(meController)));

  return router;
}
