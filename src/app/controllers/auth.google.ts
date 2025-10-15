/**
 * 모듈: Auth(google) 컨트롤러
 * 책임: HTTP 레이어에서 Google OAuth 플로우의 시작/콜백 요청을 처리한다.
 * 규칙: 컨트롤러는 얇게(밸리데이션·서비스 호출·응답 변환), 비즈니스/외부 호출은 서비스/리포지토리에 위임한다.
 */
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

import { GoogleOAuthService } from '../../core/services/GoogleOAuthService';
import { loadEnv } from '../../config/env';
import { ValidationError } from '../../shared/errors/domain';
import { UserRepositoryMySQL } from '../../infra/repositories/UserRepositoryMySQL';

/**
 * GoogleOAuthService 인스턴스를 생성한다.
 * @returns GoogleOAuthService 인스턴스(클라이언트 설정 바인딩)
 */
function getService() {
  const env = loadEnv();
  return new GoogleOAuthService({
    clientId: env.OAUTH_GOOGLE_CLIENT_ID,
    clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
    redirectUri: env.OAUTH_GOOGLE_REDIRECT_URI
  });
}

/**
 * GET /auth/google/start — Google 인증 시작(302 리다이렉트)
 * @param req Express Request(세션에 oauth_state 저장)
 * @param res Express Response(302 Location 응답)
 * @param _next 다음 미들웨어(미사용)
 * @example
 * router.get('/start', start)
 */
export async function start(req: Request, res: Response, _next: NextFunction) {
  const state = randomUUID();
  // 간단 상태 저장: 세션 사용 (MVP)
  (req.session as any).oauth_state = state;
  const svc = getService();
  const url = svc.buildAuthUrl(state);
  res.redirect(302, url);
}

/**
 * GET /auth/google/callback — Google 콜백 처리
 * @param req Express Request(query: code, state). state 검증 실패 시 ValidationError 발생.
 * @param res Express Response(성공 시 200 { ok: true } 및 세션 쿠키 설정)
 * @param next 에러 처리 미들웨어로 전달
 * @throws {ValidationError} VALIDATION_FAILED code/state 누락 또는 불일치
 * @example
 * router.get('/callback', callback)
 */
export async function callback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) throw new ValidationError('Missing code or state');
    const expected = (req.session as any).oauth_state;
    if (!expected || expected !== state) throw new ValidationError('Invalid state');

    const svc = getService();
    const token = await svc.exchangeCode(code);
    const info = await svc.fetchUserInfo(token);

    const repo = new UserRepositoryMySQL();
    const user = await repo.findOrCreateFromProvider({
      provider: 'google',
      providerUserId: info.sub,
      email: info.email ?? null,
      displayName: info.name ?? null,
      avatarUrl: info.picture ?? null
    });
    // 로그인 성공: 세션에 사용자 ID 바인딩
    req.session.userId = user.id;
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
