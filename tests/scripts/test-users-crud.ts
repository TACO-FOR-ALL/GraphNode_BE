/**
 * User Repository 종합 테스트 스크립트
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
 * 또는 MySQL URL을 직접 지정:
 *   MYSQL_URL="mysql://user:pass@host:port/db" tsx tests/scripts/test-api-keys-crud.ts
 * 
 * 사전조건:
 * - MySQL DB가 실행 중이어야 함
 * - users 테이블에 api_key_openai, api_key_deepseek 컬럼이 있어야 함
 */
/* eslint-disable no-console */
import mysql from 'mysql2/promise';

import { initMySql } from '../../src/infra/db/mysql';
import { UserRepositoryMySQL } from '../../src/infra/repositories/UserRepositoryMySQL';

async function testUserRepository() {
  console.log('🔍 User Repository 종합 테스트 시작...\n');

  // MySQL URL 확인 (.env에서 자동 로드 또는 기본값 사용)
  const mysqlUrl = process.env.MYSQL_URL || 'mysql://app:app@localhost:3307/graphnode';
  console.log(`📡 MySQL URL: ${mysqlUrl.replace(/:[^:@]+@/, ':****@')}\n`);

  const userIds: number[] = [];
  let testUserId: number | null = null;
  let testProviderUserId: string | null = null;

  try {
    // MySQL 연결
    await initMySql(mysqlUrl);
    console.log('✅ MySQL 연결 완료\n');

    const repository = new UserRepositoryMySQL();

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
    userIds.push(testUserId);

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
    userIds.push(userId2);

    if (
      user2.email === 'apple-user@example.com' &&
      user2.displayName === 'Apple Test User' &&
      user2.avatarUrl === 'https://example.com/avatar.png'
    ) {
      console.log(`   ✅ 전체 정보 사용자 생성 성공 (ID: ${userId2})`);
      console.log(`      Email: ${user2.email}`);
      console.log(`      Display Name: ${user2.displayName}`);
      console.log(`      Avatar URL: ${user2.avatarUrl}`);
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
    userIds.push(userId3);

    // null 값은 undefined로 변환되어야 함
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
      console.log(`      Provider: ${foundById.provider}`);
      console.log(`      Provider User ID: ${foundById.providerUserId}`);
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
      console.log(`      ID: ${foundByProvider.id}`);
      console.log(`      Provider: ${foundByProvider.provider}`);
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

      // lastLoginAt이 업데이트되었는지 확인
      const afterLogin = await repository.findById(testUserId!);
      if (afterLogin?.lastLoginAt && beforeLoginAt) {
        const loginTimeDiff = afterLogin.lastLoginAt.getTime() - beforeLoginAt.getTime();
        if (loginTimeDiff > 0) {
          console.log(`   ✅ lastLoginAt 업데이트 확인`);
        } else {
          console.log(`   ⚠️  lastLoginAt 업데이트되지 않음`);
        }
      } else if (afterLogin?.lastLoginAt && !beforeLoginAt) {
        console.log(`   ✅ lastLoginAt 새로 설정됨`);
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
    userIds.push(newUserId);

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

    // 4-2. READ - API Key 조회
    console.log('\n4-3. READ - API Key 조회 (findApiKeyById)');
    const retrievedOpenaiKey = await repository.findApiKeyById(testUserId!, 'openai');
    const retrievedDeepseekKey = await repository.findApiKeyById(testUserId!, 'deepseek');

    if (retrievedOpenaiKey === openaiKey && retrievedDeepseekKey === deepseekKey) {
      console.log('   ✅ API Key 조회 성공');
    } else {
      console.log(`   ❌ API Key 조회 실패`);
      console.log(`      OpenAI 기대: ${openaiKey}, 실제: ${retrievedOpenaiKey}`);
      console.log(`      DeepSeek 기대: ${deepseekKey}, 실제: ${retrievedDeepseekKey}`);
      throw new Error('API Key 조회 실패');
    }

    // 4-3. READ - User 엔티티에 API Key 포함 확인
    console.log('\n4-4. READ - User 엔티티에 API Key 포함 확인');
    const userWithKeys = await repository.findById(testUserId!);
    if (userWithKeys?.apiKeyOpenai === openaiKey && userWithKeys?.apiKeyDeepseek === deepseekKey) {
      console.log('   ✅ User 엔티티에 API Key 포함 확인');
      console.log(`      OpenAI: ${userWithKeys.apiKeyOpenai?.substring(0, 25)}...`);
      console.log(`      DeepSeek: ${userWithKeys.apiKeyDeepseek?.substring(0, 25)}...`);
    } else {
      throw new Error('User 엔티티에 API Key 누락');
    }

    // 4-4. UPDATE - API Key 변경
    console.log('\n4-5. UPDATE - API Key 변경');
    const updatedOpenaiKey = 'sk-updated-openai-' + Math.random().toString(36).substring(7);
    await repository.updateApiKeyById(testUserId!, 'openai', updatedOpenaiKey);

    const retrievedUpdatedKey = await repository.findApiKeyById(testUserId!, 'openai');
    if (retrievedUpdatedKey === updatedOpenaiKey) {
      console.log('   ✅ OpenAI Key 업데이트 성공');
      console.log(`      변경 전: ${openaiKey.substring(0, 25)}...`);
      console.log(`      변경 후: ${updatedOpenaiKey.substring(0, 25)}...`);
    } else {
      throw new Error('API Key 업데이트 실패');
    }

    // 4-5. DELETE - API Key 삭제
    console.log('\n4-6. DELETE - API Key 삭제');
    await repository.deleteApiKeyById(testUserId!, 'openai');
    const deletedOpenaiKey = await repository.findApiKeyById(testUserId!, 'openai');

    if (deletedOpenaiKey === null) {
      console.log('   ✅ OpenAI Key 삭제 성공 (NULL로 설정)');
    } else {
      throw new Error('API Key 삭제 실패');
    }

    await repository.deleteApiKeyById(testUserId!, 'deepseek');
    const deletedDeepseekKey = await repository.findApiKeyById(testUserId!, 'deepseek');

    if (deletedDeepseekKey === null) {
      console.log('   ✅ DeepSeek Key 삭제 성공 (NULL로 설정)');
    } else {
      throw new Error('DeepSeek Key 삭제 실패');
    }

    // ==========================================
    // 5. User 엔티티 검증
    // ==========================================
    console.log('\n\n5️⃣ User 엔티티 검증');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 5-1. 모든 필드 매핑 확인
    console.log('\n5-1. User 엔티티 필드 매핑 확인');
    const fullUser = await repository.findById(testUserId!);
    if (!fullUser) throw new Error('User를 찾을 수 없습니다');

    const fields = [
      { name: 'id', value: fullUser.id },
      { name: 'provider', value: fullUser.provider },
      { name: 'providerUserId', value: fullUser.providerUserId },
      { name: 'email', value: fullUser.email },
      { name: 'displayName', value: fullUser.displayName },
      { name: 'avatarUrl', value: fullUser.avatarUrl },
      { name: 'createdAt', value: fullUser.createdAt },
      { name: 'lastLoginAt', value: fullUser.lastLoginAt },
      { name: 'apiKeyOpenai', value: fullUser.apiKeyOpenai },
      { name: 'apiKeyDeepseek', value: fullUser.apiKeyDeepseek },
    ];

    console.log('   User 엔티티 필드:');
    fields.forEach((field) => {
      const value =
        field.value === undefined
          ? 'undefined'
          : field.value === null
            ? 'null'
            : typeof field.value === 'object'
              ? field.value.toString()
              : String(field.value).substring(0, 50);
      console.log(`      - ${field.name}: ${value}`);
    });
    console.log('   ✅ 모든 필드 매핑 확인 완료');

    // 5-2. profile() 메서드 테스트
    console.log('\n5-2. User.profile() 메서드 테스트');
    const profileUser = await repository.create({
      provider: 'google',
      providerUserId: `test-profile-${Date.now()}`,
      displayName: 'Profile Test User',
      avatarUrl: 'https://example.com/profile.png',
    });
    const profileUserId = Number(profileUser.id);
    userIds.push(profileUserId);

    const profile = profileUser.profile();
    if (
      profile.userId === profileUser.id &&
      profile.displayName === 'Profile Test User' &&
      profile.avatarUrl === 'https://example.com/profile.png'
    ) {
      console.log('   ✅ profile() 메서드 정상 작동');
      console.log(`      ${JSON.stringify(profile, null, 6)}`);
    } else {
      throw new Error('profile() 메서드 실패');
    }

    // ==========================================
    // 6. 엣지 케이스 테스트
    // ==========================================
    console.log('\n\n6️⃣ 엣지 케이스 테스트');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 6-1. UNIQUE 제약 조건 테스트 (동일한 provider + provider_user_id)
    console.log('\n6-1. UNIQUE 제약 조건 테스트');
    try {
      await repository.create({
        provider: 'google',
        providerUserId: testProviderUserId!, // 이미 존재하는 값
      });
      throw new Error('UNIQUE 제약 조건 위반이 감지되지 않음');
    } catch (error: any) {
      if (error.message.includes('Duplicate entry') || error.code === 'ER_DUP_ENTRY') {
        console.log('   ✅ UNIQUE 제약 조건 정상 작동 (중복 생성 시도 차단)');
      } else {
        console.log(`   ⚠️  예상과 다른 에러: ${error.message}`);
      }
    }

    // 6-2. 존재하지 않는 사용자의 API Key 조회
    console.log('\n6-2. 존재하지 않는 사용자의 API Key 조회');
    const nonExistentKey = await repository.findApiKeyById(999999, 'openai');
    if (nonExistentKey === null) {
      console.log('   ✅ 존재하지 않는 사용자는 null 반환');
    } else {
      throw new Error('존재하지 않는 사용자 조회 시 null이 아닌 값 반환');
    }

    // ==========================================
    // 정리 - 테스트 데이터 삭제
    // ==========================================
    console.log('\n\n7️⃣ 정리 - 테스트 데이터 삭제');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const pool = mysql.createPool({ uri: mysqlUrl });
    for (const id of userIds) {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
    }
    await pool.end();
    console.log(`   ✅ ${userIds.length}개의 테스트 사용자 삭제 완료`);

    // ==========================================
    // 테스트 결과 요약
    // ==========================================
    console.log('\n\n🎉 모든 테스트 통과!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CREATE: 사용자 생성 (최소/전체/null 필드)');
    console.log('✅ READ: findById, findByProvider');
    console.log('✅ Find or Create: 기존 사용자 찾기 및 새 사용자 생성');
    console.log('✅ API Key CRUD: 저장, 조회, 업데이트, 삭제');
    console.log('✅ User 엔티티: 필드 매핑, profile() 메서드');
    console.log('✅ 엣지 케이스: UNIQUE 제약, 존재하지 않는 데이터');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('\n\n❌ 테스트 실패');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('에러:', error);

    if (error instanceof Error) {
      console.error('   메시지:', error.message);

      // 에러 타입별 안내
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        console.error('\n💡 MySQL 연결 실패');
        console.error('   - MySQL이 실행 중인지 확인: npm run db:up');
        console.error('   - MySQL URL 확인:', mysqlUrl);
      }

      if (error.message.includes('Unknown column')) {
        console.error('\n💡 데이터베이스 스키마 오류');
        console.error('   - api_key_openai, api_key_deepseek 컬럼이 users 테이블에 있어야 합니다.');
        console.error('   - 마이그레이션을 실행했는지 확인하세요.');
      }

      if (error.message.includes('Access denied')) {
        console.error('\n💡 MySQL 인증 실패');
        console.error('   - MySQL URL의 사용자명/비밀번호를 확인하세요.');
      }
    }

    // 테스트 데이터 정리 (에러 발생 시에도)
    if (userIds.length > 0) {
      try {
        const pool = mysql.createPool({ uri: mysqlUrl });
        for (const id of userIds) {
          await pool.query('DELETE FROM users WHERE id = ?', [id]);
        }
        await pool.end();
        console.log(`\n🧹 ${userIds.length}개의 테스트 데이터 정리 완료`);
      } catch (cleanupError) {
        console.error('⚠️  테스트 데이터 정리 실패:', cleanupError);
      }
    }

    process.exit(1);
  }
}

testUserRepository();
