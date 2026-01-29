import jwt, { SignOptions } from 'jsonwebtoken';

import { loadEnv } from '../../config/env';

const env = loadEnv();

/**
 * JWT 페이로드 인터페이스
 * - userId: 사용자 식별자
 */
export interface JwtPayload {
  userId: string;
}

/**
 * Access Token 생성
 * @param payload 토큰에 담을 정보
 */
export function generateAccessToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRY as any,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * Refresh Token 생성
 * @param payload 토큰에 담을 정보
 */
export function generateRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRY as any,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * 토큰 검증
 * @param token JWT 문자열
 * @returns 디코딩된 페이로드
 * @throws JsonWebTokenError | TokenExpiredError
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

/**
 * 토큰 디코딩 (검증 없이 내용만 확인)
 * @param token JWT 문자열
 */
export function decodeToken(token: string): JwtPayload | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') {
    return null;
  }
  return decoded as JwtPayload;
}

/**
 * 시간 문자열(예: '1h', '7d')을 밀리초(ms) 숫자로 변환합니다.
 * - 'h': 시간
 * - 'd': 일
 * - 'm': 분
 * - 's': 초
 * - 단위가 없으면 ms로 간주
 */
export function parseDuration(duration: string): number {
  if (!duration) return 3600000; // Default 1h if missing
  const match = duration.match(/^(\d+)([dhms])?$/);
  if (!match) {
    // 숫자로만 되어 있으면 그대로 반환, 아니면 기본값(1h)
    const val = parseInt(duration, 10);
    return isNaN(val) ? 3600000 : val;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    case 's':
      return value * 1000;
    default:
      return value;
  }
}

export const JWT_ACCESS_EXPIRY_MS = parseDuration(env.JWT_ACCESS_EXPIRY);
export const JWT_REFRESH_EXPIRY_MS = parseDuration(env.JWT_REFRESH_EXPIRY);
