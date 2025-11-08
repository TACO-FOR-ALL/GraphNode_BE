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
ENV NODE_ENV=production
# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --omit=dev
# 빌드 산출물만 복사
COPY --from=builder /app/dist ./dist
# 문서/라이선스 등 필요 시 추가 복사

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/index.js"]