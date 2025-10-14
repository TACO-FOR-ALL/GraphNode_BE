# GraphNode
TACO 4th Team Project - GraphNode


## Quick Start (Local)

- Install: `npm install`
- Start DB (Docker): `npm run db:up` (logs: `npm run db:logs`, down: `npm run db:down`)
- Env: copy `.env.example` → `.env`
- Dev server: `npm run dev` → http://localhost:3000/healthz
- Build/Run: `npm run build` → `npm start`

## Useful Files

- Entry/bootstrap: [`src/index.ts`](src/index.ts), [`src/bootstrap/server.ts`](src/bootstrap/server.ts)
- Health route: [`src/app/routes/health.ts`](src/app/routes/health.ts)
- Env validation: [`src/config/env.ts`](src/config/env.ts)
- Logger/Error: [`src/shared/utils/logger.ts`](src/shared/utils/logger.ts), [`src/app/middlewares/error.ts`](src/app/middlewares/error.ts), [`src/app/presenters/problem.ts`](src/app/presenters/problem.ts), [`src/shared/errors/*`](src/shared/errors)
- DB init: [`src/infra/db/index.ts`](src/infra/db/index.ts), [`src/infra/db/mysql.ts`](src/infra/db/mysql.ts), [`src/infra/db/mongodb.ts`](src/infra/db/mongodb.ts)