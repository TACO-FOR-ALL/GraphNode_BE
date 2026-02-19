import type { Response } from 'express';

/**
 * 쿠키 보안 옵션 계산 유틸.
 * - 운영(production) && DEV_INSECURE_COOKIES !== 'true' 인 경우 secure=true
 * - SameSite=Strict, Path=/ 고정
 * - HttpOnly=false (JS에서 읽기 가능해야 하므로)
 * - Max-Age: 환경변수 COOKIE_HELPER_MAX_AGE(초) 사용, 기본 0(세션 쿠키)
 */
/**
 * 기본 쿠키 옵션 계산 (내부용)
 * @param httpOnly 자바스크립트 접근 차단 여부
 */
function buildCookieOpts(httpOnly: boolean) {
  const isProd = process.env.NODE_ENV === 'production';
  const insecure = process.env.DEV_INSECURE_COOKIES === 'true';
  // secure: 배포환경이거나, 로컬이더라도 https/cross-site 테스트가 필요한 경우 insecure=false로 설정됨.
  // insecure=true 설정이 있으면 http 환경으로 간주하여 secure=false.
  const secure = isProd ? !insecure : !insecure; 
  
  // SameSite=None requires Secure. If not secure, fallback to Lax.
  const sameSite = secure ? 'none' : 'lax';

  return {
    httpOnly,
    secure,
    sameSite: sameSite as 'none' | 'lax',
    path: '/',
  };
}

/**
 * 인증 토큰용 쿠키 옵션 (Access/Refresh Token)
 * - HttpOnly: true (XSS 방지)
 * - Signed: true (변조 방지)
 * - Secure: true (HTTPS 필수, SameSite=None을 위해)
 */
export function getAuthCookieOpts() {
  return {
    ...buildCookieOpts(true),
    signed: true,
  };
}

/**
 * 화면 표시용 쿠키 옵션 (gn-logged-in 등)
 * - HttpOnly: false (FE JS에서 읽어야 함)
 * - Signed: false (단순 플래그)
 * - Secure: true (Auth 쿠키와 동일한 환경 따름)
 */
export function getDisplayCookieOpts() {
  return {
    ...buildCookieOpts(false),
    signed: false, 
  };
}

/**
 * OAuth State용 쿠키 옵션 (보안 필수)
 * - HttpOnly: true
 * - MaxAge: 10분
 * - Signed: true (서명됨)
 */
export function getOauthStateCookieOpts() {
  const isProd = process.env.NODE_ENV === 'production';
  const insecure = process.env.DEV_INSECURE_COOKIES === 'true';
  const secure = isProd && !insecure;
  const sameSite = secure ? 'none' : 'lax';

  return {
    httpOnly: true,
    secure: secure,
    sameSite: sameSite as 'none' | 'lax',
    signed: true,
    maxAge: 10 * 60 * 1000, // 10분
    path: '/',
  };
}

/**
 * 표시용 보조 쿠키(gn-logged-in, gn-profile)를 설정한다.
 * - gn-logged-in: '1'
 * - gn-profile: base64url(JSON.stringify(profile)) — 선택
 * @param res Express Response
 * @param profile 표시용 프로필(선택)
 */
export function setHelperLoginCookies(
  res: Response,
  profile?: {
    id: string | number;
    displayName?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
  }
) {
   
  let opts = getDisplayCookieOpts();
  const maxAgeEnv = process.env.COOKIE_HELPER_MAX_AGE;
  if(maxAgeEnv) {
      (opts as any).maxAge = Number(maxAgeEnv) * 1000;
  }
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
