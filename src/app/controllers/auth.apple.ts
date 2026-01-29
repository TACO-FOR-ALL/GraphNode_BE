/**
 * 모듈: Auth(apple) 컨트롤러
 * 책임: HTTP 레이어에서 Apple OAuth 플로우의 시작/콜백 요청을 처리한다.
 */
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

import { container } from '../../bootstrap/container';
import { completeLogin } from '../utils/authLogin';
import { ValidationError } from '../../shared/errors/domain';
import { getOauthStateCookieOpts } from '../utils/sessionCookies';

function getService() {
  return container.getAppleOAuthService();
}

/**
 * GET /auth/apple/start — Apple 인증 시작(302 리다이렉트)
 * @param req Express Request(세션에 oauth_state_apple 저장)
 * @param res Express Response(302 Location 응답)
 * @param _next 다음 미들웨어(미사용)
 * @example
 * router.get('/start', start)
 */
export async function start(req: Request, res: Response, _next: NextFunction) {
  const state = randomUUID();
  res.cookie('oauth_state_apple', state, getOauthStateCookieOpts());

  const svc = getService();
  const url = svc.buildAuthUrl(state);
  res.redirect(302, url);
}

/**
 * POST /auth/apple/callback — Apple 콜백 처리 (response_mode=form_post)
 * @remarks
 * https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple
 */
export async function callback(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.body) {
      throw new ValidationError('Missing request body');
    }

    const { code, state, user } = req.body as {
      code?: string;
      state?: string;
      user?: string;
    };

    if (!code || !state) {
      throw new ValidationError('Missing code or state');
    }

    // 서명된 쿠키에서 state 검증
    const expected = req.signedCookies['oauth_state_apple'];
    if (!expected || expected !== state) {
      throw new ValidationError('Invalid state');
    }

    // 검증 완료 후 쿠키 제거
    res.clearCookie('oauth_state_apple', { path: '/' });

    const svc = getService();
    const tokenSet = await svc.exchangeCode(code);
    const info = svc.parseIdToken(tokenSet.idToken);

    await completeLogin(req, res, {
      provider: 'apple',
      providerUserId: info.sub,
      email: info.email ?? null,
      displayName: info.name ?? null,
      avatarUrl: null,
    });

    return res.status(200).send(`
      <!doctype html>
      <html>
        <body>
          <script>
            (function () {
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage(
                    { type: 'oauth-success', provider: 'apple' },
                    '*'
                  );
                }
              } catch (e) {
                try {
                  window.opener && window.opener.postMessage(
                    { type: 'oauth-error', provider: 'apple', message: e && e.message || 'unknown' },
                    '*'
                  );
                } catch (_) {}
              } finally {
                window.close();
              }
            })();
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
}
