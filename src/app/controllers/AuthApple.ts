/**
 * 모듈: Auth(apple) 컨트롤러
 * 책임: HTTP 레이어에서 Apple OAuth 플로우의 시작/콜백 요청을 처리한다.
 *
 * State 검증 전략: HMAC-signed stateless token (쿠키 미사용)
 *   - Apple callback은 response_mode=form_post로 appleid.apple.com에서 크로스사이트 POST로 도달.
 *   - Chrome의 third-party cookie 차단으로 인해 SameSite=None 쿠키도 전송되지 않을 수 있음.
 *   - 대신 SESSION_SECRET으로 HMAC-SHA256 서명된 state를 생성·검증하여
 *     저장소(Redis/DB) 없이 다중 인스턴스 환경에서도 CSRF 방어를 보장한다.
 */
import type { Request, Response, NextFunction } from 'express';

import { container } from '../../bootstrap/container';
import { completeLogin } from '../utils/authLogin';
import { ValidationError } from '../../shared/errors/domain';
import { createOauthState, verifyOauthState } from '../utils/oauthState';

function getService() {
  return container.getAppleOAuthService();
}

/**
 * GET /auth/apple/start — Apple 인증 시작(302 리다이렉트)
 * @description
 *   HMAC-signed state 토큰을 생성해 Apple Authorization URL의 state 파라미터로 전달한다.
 *   쿠키를 사용하지 않으므로 크로스사이트 쿠키 차단 환경에서도 동작한다.
 * @param req Express Request
 * @param res Express Response(302 Location 응답)
 * @param _next 다음 미들웨어(미사용)
 * @returns void
 * @throws 없음 (리다이렉트만 수행)
 * @example
 * router.get('/start', start)
 */
export async function start(req: Request, res: Response, _next: NextFunction) {
  const state = createOauthState();

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

    // HMAC-signed state 검증 (서명 + 만료 10분)
    if (!verifyOauthState(state)) {
      throw new ValidationError('Invalid state');
    }

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
