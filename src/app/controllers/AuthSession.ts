/**
 * 모듈: auth.session 컨트롤러
 * 책임: 로그아웃, 토큰 갱신 등 세션 관련 HTTP 핸들러 구현.
 */
import type { Request, Response, NextFunction } from 'express';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  JWT_ACCESS_EXPIRY_MS,
  JWT_REFRESH_EXPIRY_MS,
} from '../utils/jwt';
import { clearHelperLoginCookies, getAuthCookieOpts } from '../utils/sessionCookies';
import {
  removeSession,
  replaceSession,
  hasSession,
  toSessionId,
} from '../../infra/redis/SessionStoreRedis';
import { AuthError } from '../../shared/errors/domain';
import { completeLogin } from '../utils/authLogin';
import { loadEnv } from '../../config/env';
import prisma from '../../infra/db/prisma';
import { v4 as uuidv4 } from 'uuid';

const env = loadEnv();

/**
 * 테스트 전용 엔드포인트 접근 공통 가드
 *
 * 왜 필요한가?
 * - 테스트 로그인/테스트 유저 생성 API는 매우 강력한 기능이므로 운영에서 노출되면 위험하다.
 * - 따라서 "환경 조건 + 내부 토큰" 2중 체크를 한 곳에서 강제한다.
 *
 * 동작 규칙:
 * 1) ENABLE_TEST_LOGIN=true 이고 production이 아닐 때만 허용
 * 2) x-internal-token 헤더가 TEST_LOGIN_SECRET과 일치해야 허용
 *
 * @returns true면 다음 로직 진행 가능, false면 이미 응답을 내려서 즉시 종료해야 함
 */
function ensureTestInternalAccess(req: Request, res: Response): boolean {
  // 1) 테스트 기능이 활성화된 환경인지 확인
  const enabled = env.ENABLE_TEST_LOGIN === true && env.NODE_ENV !== 'production';
  if (!enabled) {
    // 보안 관점에서 존재를 숨기기 위해 404를 반환
    res.status(404).json({ ok: false, error: 'Not found' });
    return false;
  }

  // 2) 내부 호출 전용 시크릿 검증
  const expectedSecret = env.TEST_LOGIN_SECRET;
  const providedSecret = req.header('x-internal-token');
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    // 테스트 기능은 인가 실패를 명확히 401로 반환
    res.status(401).json({ ok: false, error: 'Unauthorized internal request' });
    return false;
  }

  // 두 조건을 모두 통과한 경우만 접근 허용
  return true;
}

/**
 * POST /auth/logout — 서버 세션 파괴 및 쿠키 만료
 * Refresh Token 쿠키로 세션 식별 후 Redis 제거
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    // refresh token 조회
    const refreshToken = req.signedCookies?.['refresh_token'];
    if (refreshToken) {
      try {
        // refresh token 검증
        const payload = verifyToken(refreshToken);

        // redis에서 세션 제거
        if (payload?.userId) {
          await removeSession(payload.userId, refreshToken);
        }
      } catch {
        // 토큰 만료/무효 시 Redis 제거 생략 (어차피 없음)
      }
    }

    // JWT 쿠키 제거
    const opts = getAuthCookieOpts();
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.clearCookie('sid', { path: '/' });
    res.clearCookie('__Host-session', { path: '/' });
    clearHelperLoginCookies(res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
}

/**
 * POST /auth/refresh — Refresh Token을 사용하여 Access Token 재발급
 * Refresh Token Rotation 적용, Redis 세션 검증
 */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.signedCookies['refresh_token'];

    // Refresh Token 검증
    if (!refreshToken) {
      throw new AuthError('No refresh token provided');
    }

    // Refresh Token 유효성 확인
    const payload = verifyToken(refreshToken);
    if (!payload?.userId) {
      throw new AuthError('Invalid refresh token');
    }

    // Redis 세션 검증 (다른 기기 로그인 등으로 무효화된 경우 거부)
    const valid = await hasSession(payload.userId, refreshToken);
    if (!valid) {
      const opts = getAuthCookieOpts();
      res.clearCookie('access_token', opts);
      res.clearCookie('refresh_token', opts);
      res.status(401).json({ ok: false, error: 'Session expired or invalidated' });
      return;
    }

    // 새로운 Access Token 및 Refresh Token 발급 (Rotation)
    const newRefreshToken = generateRefreshToken({ userId: payload.userId });
    const newAccessToken = generateAccessToken({
      userId: payload.userId,
      sessionId: toSessionId(newRefreshToken),
    });
    await replaceSession(payload.userId, refreshToken, newRefreshToken);

    // access token, refresh token 쿠키 설정
    const cookieOpts = getAuthCookieOpts();
    res.cookie('access_token', newAccessToken, {
      ...cookieOpts,
      maxAge: JWT_ACCESS_EXPIRY_MS,
    });
    res.cookie('refresh_token', newRefreshToken, {
      ...cookieOpts,
      maxAge: JWT_REFRESH_EXPIRY_MS,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    // refresh token이 유효하지 않으면 쿠키 제거
    const opts = getAuthCookieOpts();
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.status(401).json({ ok: false, error: 'Refresh failed' });
  }
}

/**
 * POST /auth/test-login — 테스트 전용 로그인 엔드포인트
 * - ENABLE_TEST_LOGIN=true 이고 NODE_ENV !== 'production' 일 때만 동작
 * - x-internal-token 헤더가 TEST_LOGIN_SECRET 과 일치해야 함
 */
export async function testLogin(req: Request, res: Response, next: NextFunction) {
  try {
    // 테스트 전용 기능 접근 권한 확인 (환경 + 내부 토큰)
    if (!ensureTestInternalAccess(req, res)) {
      return;
    }

    // 필수 입력: providerUserId
    // - 테스트 계정의 고유 식별자 역할
    const providerUserId =
      typeof req.body?.providerUserId === 'string' ? req.body.providerUserId.trim() : '';
    if (!providerUserId) {
      res.status(400).json({ ok: false, error: 'providerUserId is required' });
      return;
    }

    // 선택 입력 정규화:
    // - 빈 문자열은 null로 바꿔 저장 레이어에서 일관되게 처리
    const email =
      typeof req.body?.email === 'string' && req.body.email.trim().length > 0
        ? req.body.email.trim()
        : null;
    const displayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim().length > 0
        ? req.body.displayName.trim()
        : null;
    const avatarUrl =
      typeof req.body?.avatarUrl === 'string' && req.body.avatarUrl.trim().length > 0
        ? req.body.avatarUrl.trim()
        : null;

    // completeLogin:
    // - 사용자 find/create
    // - refresh/access 토큰 발급
    // - Redis 세션 등록
    // - 인증 쿠키 설정
    const { userId } = await completeLogin(req, res, {
      provider: 'dev',
      providerUserId,
      email,
      displayName,
      avatarUrl,
    });

    res.status(200).json({ ok: true, userId });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /auth/test-users/seed — 테스트 유저 일괄 생성/보장
 * - x-internal-token 필요
 * - provider='dev' + prefix 기반 providerUserId를 사용
 */
export async function seedTestUsers(req: Request, res: Response, next: NextFunction) {
  try {
    // 테스트 전용 기능 접근 권한 확인
    if (!ensureTestInternalAccess(req, res)) {
      return;
    }

    // 1) 생성 수량 파싱 (기본 1000)
    // 숫자/문자열 모두 허용하되 최종적으로 양수만 통과
    const countRaw = req.body?.count;
    const count = typeof countRaw === 'number' ? countRaw : Number(countRaw ?? 1000);
    if (!Number.isFinite(count) || count <= 0) {
      res.status(400).json({ ok: false, error: 'count must be a positive number' });
      return;
    }

    // 2) 도메인 정규화
    // - prefix: providerUserId의 앞부분 (예: k6-user)
    // - emailDomain: 테스트 이메일 도메인 (예: load.local)
    const prefixRaw = typeof req.body?.prefix === 'string' ? req.body.prefix.trim() : 'k6-user';
    const prefix = prefixRaw.length > 0 ? prefixRaw : 'k6-user';
    const domainRaw =
      typeof req.body?.emailDomain === 'string' ? req.body.emailDomain.trim() : 'load.local';
    const emailDomain = domainRaw.length > 0 ? domainRaw : 'load.local';

    // 3) 배치 단위 트랜잭션으로 seed를 수행한다.
    // - 대량 데이터(예: 1000건)에서 단일 트랜잭션 timeout을 피하기 위한 방식
    const batchSizeRaw = req.body?.batchSize;
    const batchSize = Math.max(
      1,
      typeof batchSizeRaw === 'number' ? Math.floor(batchSizeRaw) : Number(batchSizeRaw ?? 100)
    );
    const users: Array<{ userId: string; providerUserId: string; email: string }> = [];

    for (let start = 1; start <= count; start += batchSize) {
      const end = Math.min(count, start + batchSize - 1);
      const batchUsers = await prisma.$transaction(async (tx) => {
        const txUsers: Array<{ userId: string; providerUserId: string; email: string }> = [];

        for (let i = start; i <= end; i += 1) {
          const seq = String(i).padStart(6, '0');
          const providerUserId = `${prefix}-${seq}`;
          const email = `${providerUserId}@${emailDomain}`;

          // upsert:
          // - 기존 유저가 있으면 최신 로그인 시각/프로필을 업데이트
          // - 없으면 신규 생성
          const user = await tx.user.upsert({
            where: {
              provider_providerUserId: {
                provider: 'dev',
                providerUserId,
              },
            },
            update: {
              lastLoginAt: new Date(),
              email,
              displayName: providerUserId,
              avatarUrl: null,
            },
            create: {
              id: uuidv4(),
              provider: 'dev',
              providerUserId,
              email,
              displayName: providerUserId,
              avatarUrl: null,
              preferredLanguage: 'en',
            },
            select: {
              id: true,
            },
          });

          txUsers.push({ userId: user.id, providerUserId, email });
        }

        return txUsers;
      }, {
        // 트랜잭션 대기/실행 타임아웃 설정
        maxWait: 20000,
        timeout: 120000,
      });

      users.push(...batchUsers);
    }

    // 5) 실행 결과를 호출자에게 반환
    // - 이후 테스트 실행 서버에서 users 배열을 활용할 수 있다.
    res.status(200).json({
      ok: true,
      count: users.length,
      batchSize,
      prefix,
      emailDomain,
      users,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * DELETE /auth/test-users — 테스트 유저 일괄 삭제
 * - x-internal-token 필요
 * - provider='dev' + prefix 매칭으로 안전하게 삭제
 */
export async function deleteTestUsers(req: Request, res: Response, next: NextFunction) {
  try {
    // 테스트 전용 기능 접근 권한 확인
    if (!ensureTestInternalAccess(req, res)) {
      return;
    }

    // 1) 삭제 대상 prefix 정규화
    // - startsWith 매칭 시 오탐을 줄이기 위해 '-'를 강제한다.
    const prefixRaw = typeof req.body?.prefix === 'string' ? req.body.prefix.trim() : 'k6-user';
    const prefix = prefixRaw.length > 0 ? prefixRaw : 'k6-user';
    const normalizedPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`;

    // 2) 조건 기반 일괄 삭제
    // - 단일 deleteMany 쿼리로 단순/안전하게 처리
    // - 매칭 대상이 없어도 count=0으로 정상 응답
    const result = await prisma.user.deleteMany({
      where: {
        provider: 'dev',
        providerUserId: { startsWith: normalizedPrefix },
      },
    });

    // 3) 삭제 건수 응답
    res.status(200).json({
      ok: true,
      deletedCount: result.count,
      prefix: normalizedPrefix,
    });
  } catch (e) {
    next(e);
  }
}
