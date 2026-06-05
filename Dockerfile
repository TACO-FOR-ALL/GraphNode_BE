# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development
# Prisma generate (builder stage) needs OpenSSL on Alpine
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
# Prisma 스키마를 먼저 복사해야 generate가 타입을 생성할 수 있음
COPY prisma ./prisma
RUN npx prisma generate
# 나머지 소스 코드 복사
COPY . .
RUN npm run build
# scripts/ 폴더를 tsconfig.scripts.json으로 별도 컴파일 → dist/scripts/*.js 생성
RUN npx tsc --project tsconfig.scripts.json

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app

# OpenSSL 설치 (Prisma 요구사항)
RUN apk add --no-cache openssl

# 프로덕션 의존성만 설치 (builder에서 이미 devDeps로 빌드 완료)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma schema (entrypoint db push용)
COPY prisma ./prisma

# builder에서 Prisma 5 generate 완료분만 복사 (부분 COPY 시 @prisma/engines 누락 → entrypoint 실패)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# entrypoint db push: prisma CLI + @prisma/engines 등 전체 의존성을 runner에서 설치
RUN npm install --no-save --ignore-scripts prisma@5.22.0

# 빌드 산출물 복사
COPY --from=builder /app/dist ./dist

# Prisma Client·CLI 검증 (CI graphnode-be Exited(1) 조기 발견, GHA cache 무효화)
RUN node -e "require('@prisma/client'); console.log('Prisma client OK')" && \
  node -e "require('@prisma/engines'); console.log('Prisma engines OK')" && \
  ./node_modules/.bin/prisma --version

# Entrypoint 스크립트 복사
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# node 사용자에게 /app 디렉토리 소유권 부여
RUN chown -R node:node /app

# EXPOSE 3000
# HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
#   CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 보안을 위해 node 사용자로 전환
USER node

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]