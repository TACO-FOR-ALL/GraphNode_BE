# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
# Prisma 스키마를 먼저 복사해야 generate가 타입을 생성할 수 있음
COPY prisma ./prisma
RUN npx prisma generate
# 나머지 소스 코드 복사
COPY . .
RUN npm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app

# OpenSSL 설치 (Prisma 요구사항)
RUN apk add --no-cache openssl

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Prisma Schema 복사
COPY prisma ./prisma

# Prisma Client 생성 (런타임 전에 미리 생성)
RUN npx prisma generate

# 빌드 산출물 복사
COPY --from=builder /app/dist ./dist

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