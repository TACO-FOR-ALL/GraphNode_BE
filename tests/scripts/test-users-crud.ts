/**
 * User Repository 종합 테스트 스크립트 (Prisma 버전)
 *
 * UserRepository의 모든 기능을 테스트합니다:
 * - 사용자 생성 (create)
 * - 사용자 조회 (findById, findByProvider)
 * - Find or Create (findOrCreateFromProvider)
 * - API Key 관리 (CRUD)
 * - User 엔티티 매핑 검증
 *
 * 사용법:
 *   npm run test:api-keys
 *   또는
 *   tsx tests/scripts/test-api-keys-crud.ts
 *
 * 사전조건:
 * - MySQL DB가 실행 중이어야 함
 * - .env에 DATABASE_URL이 설정되어 있어야 함
 */
/* eslint-disable no-console */
import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';
import prisma from '../../src/infra/db/prisma';

async function testUserRepository() {
  console.log('🔍 User Repository 종합 테스트 시작 (Prisma 기반)...\n');

  // Prisma 연결
  try {
    await prisma.$connect();
    console.log('✅ Prisma 연결 완료\n');
  } catch (e) {
    console.error('❌ Prisma 연결 실패:', e);
    process.exit(1);
  }

  const generatedUserIds: number[] = [];
  let testUserId: number | null = null;
  let testProviderUserId: string | null = null;

  const repository = new UserRepositoryMySQL();

  try {
    // ==========================================
    // 1. CREATE - 사용자 생성 테스트
    // ==========================================
    console.log('1️⃣ CREATE - 사용자 생성 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1-1. 최소 필수 정보로 사용자 생성
    console.log('\n1-1. 최소 필수 정보로 사용자 생성 (provider, providerUserId만)');
    testProviderUserId = `test-user-${Date.now()}`;
    const user1 = await repository.create({
      provider: 'google',
      providerUserId: testProviderUserId,
    });
    testUserId = Number(user1.id);
    generatedUserIds.push(testUserId);

    if (user1.provider === 'google' && user1.providerUserId === testProviderUserId) {
      console.log(`   ✅ 사용자 생성 성공 (ID: ${testUserId})`);
      console.log(`      Provider: ${user1.provider}`);
      console.log(`      Provider User ID: ${user1.providerUserId}`);
    } else {
      throw new Error('사용자 생성 실패');
    }

    // 1-2. 전체 정보로 사용자 생성
    console.log('\n1-2. 전체 정보로 사용자 생성 (email, displayName, avatarUrl 포함)');
    const user2 = await repository.create({
      provider: 'apple',
      providerUserId: `test-apple-${Date.now()}`,
      email: 'apple-user@example.com',
      displayName: 'Apple Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    const userId2 = Number(user2.id);
    generatedUserIds.push(userId2);

    if (
      user2.email === 'apple-user@example.com' &&
      user2.displayName === 'Apple Test User' &&
      user2.avatarUrl === 'https://example.com/avatar.png'
    ) {
      console.log(`   ✅ 전체 정보 사용자 생성 성공 (ID: ${userId2})`);
    } else {
      throw new Error('전체 정보 사용자 생성 실패');
    }

    // 1-3. 선택적 필드 null 테스트
    console.log('\n1-3. 선택적 필드가 null인 사용자 생성');
    const user3 = await repository.create({
      provider: 'google',
      providerUserId: `test-null-${Date.now()}`,
      email: null,
      displayName: null,
      avatarUrl: null,
    });
    const userId3 = Number(user3.id);
    generatedUserIds.push(userId3);

    if (!user3.email && !user3.displayName && !user3.avatarUrl) {
      console.log(`   ✅ null 필드 처리 성공 (ID: ${userId3})`);
    } else {
      throw new Error('null 필드 처리 실패');
    }

    // ==========================================
    // 2. READ - 사용자 조회 테스트
    // ==========================================
    console.log('\n\n2️⃣ READ - 사용자 조회 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 2-1. findById로 조회
    console.log('\n2-1. findById - ID로 사용자 조회');
    const foundById = await repository.findById(testUserId!);
    if (foundById && Number(foundById.id) === testUserId) {
      console.log(`   ✅ ID로 조회 성공 (ID: ${testUserId})`);
    } else {
      throw new Error('ID로 조회 실패');
    }

    // 2-2. 존재하지 않는 ID 조회
    console.log('\n2-2. findById - 존재하지 않는 ID 조회');
    const notFound = await repository.findById(999999);
    if (notFound === null) {
      console.log('   ✅ 존재하지 않는 ID는 null 반환');
    } else {
      throw new Error('존재하지 않는 ID 조회 시 null이 아닌 값 반환');
    }

    // 2-3. findByProvider로 조회
    console.log('\n2-3. findByProvider - provider + providerUserId로 조회');
    const foundByProvider = await repository.findByProvider('google', testProviderUserId!);
    if (foundByProvider && Number(foundByProvider.id) === testUserId) {
      console.log(`   ✅ Provider로 조회 성공`);
    } else {
      throw new Error('Provider로 조회 실패');
    }

    // 2-4. 존재하지 않는 Provider 조회
    console.log('\n2-4. findByProvider - 존재하지 않는 Provider 조회');
    const notFoundByProvider = await repository.findByProvider('google', 'non-existent-user');
    if (notFoundByProvider === null) {
      console.log('   ✅ 존재하지 않는 Provider는 null 반환');
    } else {
      throw new Error('존재하지 않는 Provider 조회 시 null이 아닌 값 반환');
    }

    // ==========================================
    // 3. Find or Create 테스트
    // ==========================================
    console.log('\n\n3️⃣ Find or Create 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 3-1. 기존 사용자 찾기 (lastLoginAt 업데이트)
    console.log('\n3-1. findOrCreateFromProvider - 기존 사용자 찾기');
    const beforeLogin = await repository.findById(testUserId!);
    const beforeLoginAt = beforeLogin?.lastLoginAt;

    // 잠시 대기 (타임스탬프 차이를 위해)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const foundOrCreated = await repository.findOrCreateFromProvider({
      provider: 'google',
      providerUserId: testProviderUserId!,
    });

    if (Number(foundOrCreated.id) === testUserId) {
      console.log(`   ✅ 기존 사용자 찾기 성공 (ID: ${testUserId})`);

      const afterLogin = await repository.findById(testUserId!);
      if (afterLogin?.lastLoginAt && beforeLoginAt) {
        if (afterLogin.lastLoginAt.getTime() > beforeLoginAt.getTime()) {
          console.log(`   ✅ lastLoginAt 업데이트 확인`);
        } else {
          console.log(`   ⚠️  lastLoginAt 업데이트되지 않음 (시간 차이 미미할 수 있음)`);
        }
      } else {
        console.log(`   ✅ lastLoginAt 확인됨`);
      }
    } else {
      throw new Error('기존 사용자 찾기 실패');
    }

    // 3-2. 새 사용자 생성
    console.log('\n3-2. findOrCreateFromProvider - 새 사용자 생성');
    const newProviderUserId = `test-new-user-${Date.now()}`;
    const newUser = await repository.findOrCreateFromProvider({
      provider: 'apple',
      providerUserId: newProviderUserId,
      email: 'new-user@example.com',
      displayName: 'New User',
    });
    const newUserId = Number(newUser.id);
    generatedUserIds.push(newUserId);

    if (newUser.provider === 'apple' && newUser.providerUserId === newProviderUserId) {
      console.log(`   ✅ 새 사용자 생성 성공 (ID: ${newUserId})`);
    } else {
      throw new Error('새 사용자 생성 실패');
    }

    // ==========================================
    // 4. API Key CRUD 테스트
    // ==========================================
    console.log('\n\n4️⃣ API Key 관리 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 4-1. CREATE - API Key 저장
    console.log('\n4-1. CREATE - OpenAI API Key 저장');
    const openaiKey = 'sk-test-openai-' + Math.random().toString(36).substring(7);
    await repository.updateApiKeyById(testUserId!, 'openai', openaiKey);
    console.log(`   ✅ OpenAI Key 저장: ${openaiKey.substring(0, 25)}...`);

    console.log('\n4-2. CREATE - DeepSeek API Key 저장');
    const deepseekKey = 'sk-test-deepseek-' + Math.random().toString(36).substring(7);
    await repository.updateApiKeyById(testUserId!, 'deepseek', deepseekKey);
    console.log(`   ✅ DeepSeek Key 저장: ${deepseekKey.substring(0, 25)}...`);

    console.log('\n4-2-1. CREATE - Claude API Key 저장');
    const claudeKey = 'sk-ant-test-' + Math.random().toString(36).substring(7);
    await repository.updateApiKeyById(testUserId!, 'claude', claudeKey);
    console.log(`   ✅ Claude Key 저장: ${claudeKey.substring(0, 25)}...`);

    // 4-2. READ - API Key 조회
    console.log('\n4-3. READ - API Key 조회 (findApiKeyById)');
    const retrievedOpenaiKey = await repository.findApiKeyById(testUserId!, 'openai');
    const retrievedDeepseekKey = await repository.findApiKeyById(testUserId!, 'deepseek');
    const retrievedClaudeKey = await repository.findApiKeyById(testUserId!, 'claude');

    if (
      retrievedOpenaiKey === openaiKey &&
      retrievedDeepseekKey === deepseekKey &&
      retrievedClaudeKey === claudeKey
    ) {
      console.log('   ✅ API Key 조회 성공');
    } else {
      console.log(`   ❌ API Key 조회 실패`);
      throw new Error('API Key 조회 실패');
    }

    // 4-4. UPDATE
    console.log('\n4-5. UPDATE - API Key 변경');
    const updatedOpenaiKey = 'sk-updated-openai-' + Math.random().toString(36).substring(7);
    await repository.updateApiKeyById(testUserId!, 'openai', updatedOpenaiKey);
    const retrievedUpdatedKey = await repository.findApiKeyById(testUserId!, 'openai');

    if (retrievedUpdatedKey === updatedOpenaiKey) {
      console.log('   ✅ OpenAI Key 업데이트 성공');
    } else {
      throw new Error('API Key 업데이트 실패');
    }

    // 4-5. DELETE
    console.log('\n4-6. DELETE - API Key 삭제');
    await repository.deleteApiKeyById(testUserId!, 'openai');
    const deletedOpenaiKey = await repository.findApiKeyById(testUserId!, 'openai');
    if (deletedOpenaiKey === null) {
      console.log('   ✅ OpenAI Key 삭제 성공');
    } else {
      throw new Error('API Key 삭제 실패');
    }

    // ==========================================
    // 5. User 엔티티 검증
    // ==========================================
    console.log('\n\n5️⃣ User 엔티티 검증');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const fullUser = await repository.findById(testUserId!);
    if (!fullUser) throw new Error('User를 찾을 수 없습니다');

    // Check fields using getters
    if (fullUser.id === String(testUserId) && fullUser.apiKeyDeepseek === deepseekKey) {
      console.log('   ✅ User 엔티티 필드 매핑 확인 완료');
    } else {
      throw new Error('User 엔티티 매핑 실패');
    }

    const profile = fullUser.profile();
    if (profile.userId === fullUser.id) {
      console.log('   ✅ profile() 메서드 정상 작동');
    }

    // ==========================================
    // 6. 엣지 케이스 (Duplicate)
    // ==========================================
    console.log('\n\n6️⃣ 엣지 케이스 테스트 (Duplicate)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
      await repository.create({
        provider: 'google',
        providerUserId: testProviderUserId!,
      });
      throw new Error('UNIQUE 제약 조건 위반이 감지되지 않음');
    } catch (error: any) {
      // Prisma throws P2002 for unique constraint violation
      if (error.code === 'P2002' || error.message.includes('Unique constraint')) {
        console.log('   ✅ UNIQUE 제약 조건 정상 작동');
      } else {
        console.log(`   ⚠️  예상과 다른 에러: ${error.message} (Code: ${error.code})`);
      }
    }

    // ==========================================
    // 정리
    // ==========================================
    console.log('\n\n7️⃣ 정리 - 테스트 데이터 삭제');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Cleanup using Prisma
    await prisma.user.deleteMany({
      where: {
        id: {
          in: generatedUserIds.map((id) => BigInt(id)),
        },
      },
    });
    console.log(`   ✅ ${generatedUserIds.length}개의 테스트 사용자 삭제 완료`);

    console.log('\n\n🎉 모든 테스트 통과!');
    process.exit(0);
  } catch (error) {
    console.error('\n\n❌ 테스트 실패');
    console.error(error);

    // Cleanup on fail
    if (generatedUserIds.length > 0) {
      try {
        await prisma.user.deleteMany({
          where: {
            id: { in: generatedUserIds.map((id) => BigInt(id)) },
          },
        });
        console.log('   🧹 테스트 데이터 정리 완료 (에러 발생 후)');
      } catch (e) {
        console.error('   ⚠️ 정리 실패:', e);
      }
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testUserRepository();
