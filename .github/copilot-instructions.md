# Copilot Instructions for GraphNode_BE

Purpose: Help AI coding agents work effectively in this repo from day one.

## Architecture (big picture)
- Stack: TypeScript + Node.js (Express). Entry: `src/index.ts` → `src/bootstrap/server.ts`.
- Layering follows MVC + Service/Ports (see `/.github/instructions/MVS.instructions.md`):
  - app: HTTP layer only (`src/app/{routes,controllers,middlewares}`)
  - core: business (`src/core/{services,domain,ports}`)
  - infra: adapters (`src/infra/{repositories,http,db}`)
  - shared: cross-cutting (`src/shared/{errors,dtos,utils}`)
- Error/Logging: Errors must be serialized as RFC 9457 Problem Details. See `/.github/instructions/ErrorCode.instructions.md` and `ErrorFormat.instructions.md`.
- Auth: BFF owns OAuth2. Desktop app never handles provider tokens. See `/.github/instructions/Account.instructions.md` and `OAuth2.instructions.md`.

## Conventions that matter
- REST rules: Resource-first, POST=201 + Location, `application/problem+json` for errors. See `/.github/instructions/RestfulAPI.instructions.md`.
- Session: long-lived opaque tokens stored hashed server-side. Do not expose provider tokens to clients.
- Logging: use centralized logger (no console.* in production code). Include correlationId from `traceparent`.
- Docs: OpenAPI 3.1 in `/docs/api/openapi.yaml`; JSON Schema 2020-12 in `/docs/schemas/*` (Problem Details included). Maintain examples and Spectral lint.
- Tests: Use Jest (+ Supertest/Testcontainers per `Testcode.instructions.md`). All error responses must validate against Problem Details schema.

## Project layout (created/expected)
- `src/bootstrap/server.ts` creates Express app, mounts routers (ex: `src/app/routes/health.ts`).
- `src/app/routes/health.ts` exposes `GET /healthz` (also available under `/v1/healthz`).
- Future endpoints: place controllers in `src/app/controllers`, call services from `src/core/services` only; services depend on `src/core/ports` interfaces; infra implements ports.

## How to run (local)
- Dev: `npm run dev` (uses tsx). Server listens on `http://localhost:3000`.
- Build: `npm run build`; Start compiled: `npm start`.
- Lint/Format: `npm run lint` / `npm run format` (ESLint v9 flat config in `eslint.config.js`).

## Patterns and gotchas
- Keep imports framework-free in `core/**`. Don’t import Express types beyond `app/**`.
- Map all thrown service errors (`shared/errors`) via central error middleware to Problem Details.
- For OAuth providers (Google/Apple), perform code exchange on server only; encrypt refresh tokens at rest; client only receives our opaque session token.
- Sync API (planned): implement `/sync/push` with Idempotency-Key and `/sync/pull` with RFC3339 `since` cursors; LWW on conflicts. See `/.github/instructions/Sync.instructions.md`.
- Secrets: from environment/secret manager only; never log secrets; store session tokens as hashes. See `/.github/instructions/secretKey.instructions.md`.

## Example slices
- Health route: `src/app/routes/health.ts`
- App bootstrap: `src/bootstrap/server.ts`

## When adding features
- Start with OpenAPI under `/docs/api/openapi.yaml`, then implement controller → service → repository.
- Return 201 + Location for creates; use `application/problem+json` for any error path.
- Add JSDoc to public APIs; prefer mappers/presenters to keep layers clean.

If anything here is unclear or missing (e.g., actual logger, error middleware, OpenAPI docs path), tell us what you need and propose a minimal change. 