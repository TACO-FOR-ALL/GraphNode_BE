import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Prisma 싱글톤 모듈을 mock하여
 * UserRepositoryMySQL의 user_info 분리 로직만 단위 검증합니다.
 */
const prismaMock: any = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userInfo: {
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../src/infra/db/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

describe('UserRepositoryMySQL - user_info relation', () => {
  let repo: UserRepositoryMySQL;

  beforeEach(() => {
    // 각 테스트마다 리포지토리 인스턴스를 새로 만들고 mock 호출 이력을 초기화합니다.
    repo = new UserRepositoryMySQL();
    jest.clearAllMocks();
  });

  it('create() should create only user row and defer user_info until onboarding', async () => {
    // [목적]
    // 로그인(최초 user 생성) 시점에는 user_info를 만들지 않고,
    // 온보딩 업데이트 시점까지 생성을 지연하는지 검증합니다.

    // user 테이블 insert 결과(관계 포함)를 가정합니다.
    prismaMock.user.create.mockResolvedValue({
      id: 'user-1',
      provider: 'google',
      providerUserId: 'google-1',
      email: 'test@example.com',
      displayName: 'tester',
      avatarUrl: null,
      apiKeyOpenai: null,
      apiKeyDeepseek: null,
      apiKeyClaude: null,
      apiKeyGemini: null,
      createdAt: new Date('2026-04-13T00:00:00.000Z'),
      lastLoginAt: null,
      openaiAssistantId: null,
      preferredLanguage: 'en',
      userInfoId: null,
      userInfo: null,
    });

    const created = await repo.create({
      provider: 'google',
      providerUserId: 'google-1',
      email: 'test@example.com',
      displayName: 'tester',
      avatarUrl: null,
    });

    // 로그인 시점에는 user_info를 생성하지 않아야 합니다.
    expect(prismaMock.userInfo.create).not.toHaveBeenCalled();
    // user 생성 시 userInfoId 없이 저장되는지 확인합니다.
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: expect.any(String),
          provider: 'google',
          providerUserId: 'google-1',
        }),
      })
    );
    // user_info가 아직 없더라도 도메인 기본값(formal, [])으로 매핑되는지 확인합니다.
    expect(created.onboardingAgentMode).toBe('formal');
    expect(created.onboardingInterests).toEqual([]);
  });

  it('updateOnboarding() should update existing linked user_info', async () => {
    // [목적]
    // 이미 users.user_info_id가 존재하는 경우,
    // user_info를 새로 만들지 않고 기존 row만 업데이트하는지 검증합니다.
    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        user: {
          // user가 이미 user_info를 참조하고 있는 상태를 가정합니다.
          findUnique: jest.fn().mockImplementation(async () => ({ userInfoId: 'info-existing' })),
          update: jest.fn(),
        },
        userInfo: {
          create: jest.fn(),
          update: jest.fn().mockImplementation(async () => ({})),
        },
      };
      await cb(tx);
      // 기존 연결이 있으면 새 user_info 생성이 없어야 합니다.
      expect(tx.userInfo.create).not.toHaveBeenCalled();
      // FK 재연결 update도 없어야 합니다.
      expect(tx.user.update).not.toHaveBeenCalled();
      // 기존 user_info row를 원하는 값으로 업데이트해야 합니다.
      expect(tx.userInfo.update).toHaveBeenCalledWith({
        where: { id: 'info-existing' },
        data: {
          onboardingOccupation: 'developer',
          onboardingInterests: ['AI', 'Research'],
          onboardingAgentMode: 'friendly',
        },
      });
    });

    await repo.updateOnboarding('user-1', {
      occupation: 'developer',
      interests: ['AI', 'Research'],
      agentMode: 'friendly',
    });
  });

  it('updateOnboarding() should create and attach user_info when missing', async () => {
    // [목적]
    // users.user_info_id가 비어 있는 사용자라면
    // 1) user_info 생성 -> 2) users에 FK 연결 -> 3) user_info 값 업데이트
    // 순서의 흐름이 성립하는지 검증합니다.
    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        user: {
          // user는 존재하지만 user_info 연결이 없는 상태를 가정합니다.
          findUnique: jest.fn().mockImplementation(async () => ({ userInfoId: null })),
          update: jest.fn().mockImplementation(async () => ({})),
        },
        userInfo: {
          create: jest.fn().mockImplementation(async () => ({ id: 'info-new' })),
          update: jest.fn().mockImplementation(async () => ({})),
        },
      };
      await cb(tx);
      // user_info 신규 row 생성
      expect(tx.userInfo.create).toHaveBeenCalledWith({ data: {} });
      // 생성된 user_info.id를 users.user_info_id로 연결
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { userInfoId: 'info-new' },
      });
      // 연결된 user_info row에 온보딩 값 반영
      expect(tx.userInfo.update).toHaveBeenCalledWith({
        where: { id: 'info-new' },
        data: {
          onboardingOccupation: 'creator',
          onboardingInterests: ['Writing'],
          onboardingAgentMode: 'casual',
        },
      });
    });

    await repo.updateOnboarding('user-1', {
      occupation: 'creator',
      interests: ['Writing'],
      agentMode: 'casual',
    });
  });
});
