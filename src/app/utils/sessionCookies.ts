import type { Response } from 'express';

/**
 * 쿠키 보안 옵션 계산 유틸.
 * - 운영(production) && DEV_INSECURE_COOKIES !== 'true' 인 경우 secure=true
 * - SameSite=Strict, Path=/ 고정
 * - HttpOnly=false (JS에서 읽기 가능해야 하므로)
 * - Max-Age: 환경변수 COOKIE_HELPER_MAX_AGE(초) 사용, 기본 0(세션 쿠키)
 */
function cookieOpts() {
  const isProd = process.env.NODE_ENV === 'production';
  const insecure = process.env.DEV_INSECURE_COOKIES === 'true';
  const secure = isProd && !insecure;
  const maxAgeEnv = process.env.COOKIE_HELPER_MAX_AGE;
  const maxAge = maxAgeEnv ? Number(maxAgeEnv) * 1000 : undefined; // millis, undefined=세션쿠키

  const cookieConfig = isProd
  ? {
      httpOnly: false,
      sameSite: 'none' as const,
      secure: true,
    }
  : {
      httpOnly: false,
      sameSite: 'lax' as const,
      secure: false,
    };
  


  return { ...cookieConfig, path: '/', ...(maxAge ? { maxAge } : {}) };
}

/**
 * 표시용 보조 쿠키(gn-logged-in, gn-profile)를 설정한다.
 * - gn-logged-in: '1'
 * - gn-profile: base64url(JSON.stringify(profile)) — 선택
 * @param res Express Response
 * @param profile 표시용 프로필(선택)
 */
export function setHelperLoginCookies(res: Response, profile?: { id: string | number; displayName?: string | null; avatarUrl?: string | null; email?: string | null }) {
  const opts = cookieOpts();
  res.cookie('gn-logged-in', '1', opts);
  if (profile) {
    const encoded = Buffer.from(JSON.stringify(profile)).toString('base64url');
    res.cookie('gn-profile', encoded, opts);
  }
}

/**
 * 표시용 보조 쿠키를 제거한다.
 */
export function clearHelperLoginCookies(res: Response) {
  res.clearCookie('gn-logged-in', { path: '/' });
  res.clearCookie('gn-profile', { path: '/' });
}
