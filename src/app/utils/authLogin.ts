/**
 * 모듈: 인증 공용 유틸
 * 책임: OAuth provider 콜백 이후 공통 로그인 처리(findOrCreate → 세션 바인딩 → 표시용 쿠키).
 */
import type { Request, Response } from 'express';

import { UserRepositoryMySQL } from '../../infra/repositories/UserRepositoryMySQL';
import { setHelperLoginCookies } from './sessionCookies';
import type { Provider } from '../../core/domain/User';

export interface ProviderUserInput {
  provider: Provider;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface LoginResult {
  userId: string | number;
}

/**
 * 공용 로그인 처리: 사용자 upsert/find → 세션 userId 저장 → 표시용 쿠키 설정.
 * @param req Express Request (세션 저장을 위해 필요)
 * @param res Express Response (표시용 보조 쿠키 설정을 위해 필요)
 * @param input provider, providerUserId, email, displayName, avatarUrl
 * @returns {LoginResult} userId
 */
export async function completeLogin(req: Request, res: Response, input: ProviderUserInput): Promise<LoginResult> {
  const repo = new UserRepositoryMySQL();
  const user = await repo.findOrCreateFromProvider({
    provider: input.provider,
    providerUserId: input.providerUserId,
    email: input.email,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl
  });

  // 세션에 사용자 ID 바인딩
  (req.session as any).userId = (user as any).id;

  // 표시용 보조 쿠키 설정
  setHelperLoginCookies(res, {
    id: (user as any).id,
    displayName: (user as any).displayName ?? null,
    avatarUrl: (user as any).avatarUrl ?? null
  });

  return { userId: (user as any).id };
}
