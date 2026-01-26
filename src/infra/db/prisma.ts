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

// 쿼리 로깅 설정 (옵션)
prisma.$on('query', (e) => {
  // 너무 빈번할 수 있으므로 debug 레벨 권장
  logger.debug({ system: 'prisma', duration: e.duration, query: e.query }, 'Prisma Query');
});

export default prisma;
