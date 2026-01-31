/**
 * 개발 전용 인증 컨트롤러
 * - NODE_ENV=development에서만 활성화
 * - 테스트 계정으로 간편하게 로그인 가능
 */

import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, JWT_ACCESS_EXPIRY_MS, JWT_REFRESH_EXPIRY_MS } from '../utils/jwt';
import { UserRepositoryMySQL } from '../../infra/repositories/UserRepositoryMySQL';

/**
 * 개발 전용 간편 로그인
 * - 테스트용 providerUserId로 DB에서 유저를 찾아 실제 ID로 토큰 발급
 */
export async function devLogin(req: Request, res: Response) {
  // 프로덕션 환경에서는 절대 실행되지 않도록
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }

  // 요청 body에서 providerUserId 받기 (없으면 기본값 '123')
  const providerUserId = req.body.userId || '123';

  // DB에서 실제 유저 찾기
  const userRepo = new UserRepositoryMySQL();
  const user = await userRepo.findByProvider('dev', providerUserId);

  if (!user) {
    return res.status(404).json({
      message: 'Test user not found. Please run: npm run seed:test-user',
    });
  }

  // 실제 데이터베이스 ID 사용
  const userId = user.id;

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
    profile: {
      id: userId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  });
}
