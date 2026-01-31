/**
 * 개발 전용 인증 컨트롤러
 * - NODE_ENV=development에서만 활성화
 * - 테스트 계정으로 간편하게 로그인 가능
 */

import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, JWT_ACCESS_EXPIRY_MS, JWT_REFRESH_EXPIRY_MS } from '../utils/jwt';

/**
 * 개발 전용 간편 로그인
 * - 테스트용 userId로 바로 토큰 발급
 */
export async function devLogin(req: Request, res: Response) {
  // 프로덕션 환경에서는 절대 실행되지 않도록
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }

  // 요청 body에서 userId 받기 (없으면 기본값 사용)
  // 123은 프론트엔드에서 사용하는 테스트 userId
  const userId = req.body.userId || '123';

  // Access Token & Refresh Token 생성
  const accessToken = generateAccessToken({ userId });
  const refreshToken = generateRefreshToken({ userId });

  const isProd = process.env.NODE_ENV === 'production';
  const insecure = process.env.DEV_INSECURE_COOKIES === 'true';
  const secure = isProd && !insecure;
  const sameSite = secure ? 'none' : 'lax';

  // 쿠키 설정
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite: sameSite as 'none' | 'lax',
    signed: true,
    maxAge: JWT_ACCESS_EXPIRY_MS,
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: sameSite as 'none' | 'lax',
    signed: true,
    maxAge: JWT_REFRESH_EXPIRY_MS,
  });

  return res.json({
    message: 'Development login successful',
    userId,
    accessToken, // 클라이언트가 필요하면 사용 가능
  });
}
