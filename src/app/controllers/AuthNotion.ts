import type { Request, Response, NextFunction } from 'express';

import type { NotionService } from '../../core/services/NotionService';
import { AuthError, ValidationError } from '../../shared/errors/domain';
import { createNotionLinkOauthState, parseOauthState } from '../utils/oauthState';

/**
 * @description Notion OAuth 연동 컨트롤러 (기존 로그인 세션에 workspace 토큰 연결).
 */
export class AuthNotionController {
  constructor(private readonly notionService: NotionService) {}

  /**
   * @description GET /api/auth/notion — Notion authorize URL 반환 또는 리다이렉트.
   * @query redirect=true 이면 302, 아니면 JSON `{ url }`.
   */
  async start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) throw new AuthError('Login required before linking Notion');

      const state = createNotionLinkOauthState(userId);
      const url = this.notionService.buildAuthorizationUrl(state);

      if (req.query.redirect === 'true') {
        res.redirect(url);
        return;
      }
      res.status(200).json({ url });
    } catch (e) {
      next(e);
    }
  }

  /**
   * @description GET /api/auth/notion/callback — code → token 저장.
   */
  async callback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const error = typeof req.query.error === 'string' ? req.query.error : undefined;

      if (error) {
        throw new ValidationError(`Notion OAuth denied: ${error}`);
      }
      if (!code || !state) {
        throw new ValidationError('Missing code or state from Notion callback');
      }

      const payload = parseOauthState(state);
      if (!payload?.userId || payload.purpose !== 'notion_link') {
        throw new ValidationError('Invalid or expired OAuth state');
      }

      const integration = await this.notionService.connectWorkspaceFromCode(
        payload.userId,
        code
      );

      const result = {
        ok: true as const,
        integrationId: integration.id,
        notionWorkspaceId: integration.notionWorkspaceId,
        notionWorkspaceName: integration.notionWorkspaceName,
      };

      if (req.query.format === 'json') {
        res.status(200).json(result);
        return;
      }

      res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
      res.status(200).send(`
        <!doctype html>
        <html><body><script>
          (function () {
            var payload = ${JSON.stringify({ type: 'notion-link-success', ...result })};
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage(payload, '*');
              }
            } catch (e) {
              console.error(e);
            }
            window.close();
          })();
        </script><p>Notion connected. You can close this window.</p></body></html>
      `);
    } catch (e) {
      next(e);
    }
  }
}
