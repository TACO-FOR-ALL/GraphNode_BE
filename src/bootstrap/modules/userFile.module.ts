import { Router } from 'express';

import { createUserFileRouter } from '../../app/routes/UserFileRouter';
import { container } from '../container';

/**
 * 사용자 파일·사이드바 라우터 조립.
 *
 * `UserFileService`를 컨테이너에서 꺼내 `createUserFileRouter`에 주입한다.
 */
export function makeUserFileRouter(): Router {
  return createUserFileRouter({ userFileService: container.getUserFileService() });
}
