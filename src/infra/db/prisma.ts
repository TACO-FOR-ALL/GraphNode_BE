import { PrismaClient } from '@prisma/client';

import { logger } from '../../shared/utils/logger';

// PrismaClient 인스턴스를 재사용하기 위한 싱글톤 모듈
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
  ],
});

// 쿼리 이벤트 타입은 Prisma client 버전/엔트리포인트 차이에 따라 흔들릴 수 있으므로
// 여기서는 콜백 시그니처 추론에 맡겨 CI 타입 호환성을 유지한다.
prisma.$on('query', (e) => {
  // 너무 빈번할 수 있으므로 debug 레벨 권장
  logger.debug({ system: 'prisma', duration: e.duration, query: e.query }, 'Prisma Query');
});

export default prisma;
