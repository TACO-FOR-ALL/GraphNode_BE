import type { Request, Response, NextFunction } from 'express';

import { bindUserIdToRequest } from '../utils/request';
import { bindSessionUser } from './session';
import { requireLogin } from './auth';

function isValidInternalToken(token: string | undefined): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token && token === expected);
}

export function internalOrSession(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-internal-token');
  if (isValidInternalToken(token)) {
    const userId = req.header('x-user-id');
    if (!userId) {
      res.status(401).json({ message: 'x-user-id is required' });
      return;
    }
    bindUserIdToRequest(req, userId);
    next();
    return;
  }

  bindSessionUser(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    requireLogin(req, res, next);
  });
}
