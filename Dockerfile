# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci && npm cache clean --force
# 빌드 산출물만 복사
COPY --from=builder /app/dist ./dist
# Prisma Schema 복사 (런타임에 db push 필요 시)
COPY prisma ./prisma
# Entrypoint 스크립트 복사
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]