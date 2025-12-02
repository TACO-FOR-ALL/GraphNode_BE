
import { Response } from 'express';

import { getUserIdFromRequest, bindUserIdToSession } from '../../src/app/utils/request';
import { setHelperLoginCookies, clearHelperLoginCookies } from '../../src/app/utils/sessionCookies';

describe('Utils Unit Tests', () => {
  describe('request.ts', () => {
    describe('getUserIdFromRequest', () => {
      it('should return req.userId if present', () => {
        const req = { userId: 'u_1' } as any;
        expect(getUserIdFromRequest(req)).toBe('u_1');
      });

      it('should return session.userId if req.userId is missing', () => {
        const req = { session: { userId: 'u_2' } } as any;
        expect(getUserIdFromRequest(req)).toBe('u_2');
      });

      it('should return undefined if neither is present', () => {
        const req = { session: {} } as any;
        expect(getUserIdFromRequest(req)).toBeUndefined();
      });

      it('should return undefined if session is missing', () => {
        const req = {} as any;
        expect(getUserIdFromRequest(req)).toBeUndefined();
      });
    });

    describe('bindUserIdToSession', () => {
      it('should set userId on session', () => {
        const req = { session: {} } as any;
        bindUserIdToSession(req, 'u_3');
        expect(req.session.userId).toBe('u_3');
      });
    });
  });

  describe('sessionCookies.ts', () => {
    let res: Response;
    let cookieSpy: jest.SpyInstance;
    let clearCookieSpy: jest.SpyInstance;

    beforeEach(() => {
      res = {
        cookie: jest.fn(),
        clearCookie: jest.fn(),
      } as any;
      cookieSpy = jest.spyOn(res, 'cookie');
      clearCookieSpy = jest.spyOn(res, 'clearCookie');
      process.env.NODE_ENV = 'test';
      process.env.DEV_INSECURE_COOKIES = 'false';
      delete process.env.COOKIE_HELPER_MAX_AGE;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('setHelperLoginCookies', () => {
      it('should set gn-logged-in cookie', () => {
        setHelperLoginCookies(res);
        expect(cookieSpy).toHaveBeenCalledWith('gn-logged-in', '1', expect.objectContaining({
          path: '/',
          httpOnly: false,
          sameSite: 'lax',
          secure: false,
        }));
      });

      it('should set gn-profile cookie if profile provided', () => {
        const profile = { id: 'u_1', displayName: 'Test' };
        setHelperLoginCookies(res, profile);
        expect(cookieSpy).toHaveBeenCalledWith('gn-profile', expect.any(String), expect.anything());
      });

      it('should use secure cookies in production', () => {
        process.env.NODE_ENV = 'production';
        setHelperLoginCookies(res);
        expect(cookieSpy).toHaveBeenCalledWith('gn-logged-in', '1', expect.objectContaining({
          secure: true,
          sameSite: 'none',
        }));
      });

      it('should allow insecure cookies in production if DEV_INSECURE_COOKIES is true', () => {
        process.env.NODE_ENV = 'production';
        process.env.DEV_INSECURE_COOKIES = 'true';
        setHelperLoginCookies(res);
        expect(cookieSpy).toHaveBeenCalledWith('gn-logged-in', '1', expect.objectContaining({
          secure: false,
          sameSite: 'lax',
        }));
      });

      it('should set maxAge if COOKIE_HELPER_MAX_AGE is set', () => {
        process.env.COOKIE_HELPER_MAX_AGE = '3600';
        setHelperLoginCookies(res);
        expect(cookieSpy).toHaveBeenCalledWith('gn-logged-in', '1', expect.objectContaining({
          maxAge: 3600000,
        }));
      });
    });

    describe('clearHelperLoginCookies', () => {
      it('should clear cookies', () => {
        clearHelperLoginCookies(res);
        expect(clearCookieSpy).toHaveBeenCalledWith('gn-logged-in', { path: '/' });
        expect(clearCookieSpy).toHaveBeenCalledWith('gn-profile', { path: '/' });
      });
    });
  });
});
