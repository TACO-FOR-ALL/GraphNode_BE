# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the application code. Core HTTP and domain logic lives under `src/app`, shared bootstrap/config code under `src/bootstrap` and `src/config`, infrastructure adapters under `src/infra`, and background jobs under `src/workers`. Database schema and migrations are in `prisma/`. Tests are grouped in `tests/unit`, `tests/api`, `tests/e2e`, `tests/schemas`, and `tests/scripts`. Generated output and local artifacts such as `dist/`, `coverage/`, and `graph_outputs/` should not be treated as source.

## Build, Test, and Development Commands
Run commands from the repository root.

- `npm run dev`: start the TypeScript server with `tsx watch`.
- `npm run build`: compile production output into `dist/`.
- `npm run start`: run the compiled server.
- `npm run lint`: check TypeScript files with ESLint.
- `npm run format`: apply Prettier across the repo.
- `npm test`: run Jest tests with coverage enabled.
- `npm run db:up` / `npm run db:down`: start or tear down the local Docker-backed database stack.
- `npm run docs:build`: rebuild OpenAPI, TypeDoc, and changelog docs.

## Coding Style & Naming Conventions
This repo uses TypeScript with Prettier and ESLint. Follow 2-space indentation, semicolons, single quotes, trailing commas where valid, and a `printWidth` of 100. Keep imports grouped in ESLint order: builtin/external, internal, then relative. Prefer explicit types at module boundaries and avoid unused imports. Use `PascalCase` for classes and DTOs, `camelCase` for functions/variables, and descriptive kebab-style names for spec files such as `auth.google.spec.ts`.

## Testing Guidelines
Jest with `ts-jest` is the default test runner. Standard specs live under `tests/**/*.spec.ts`; `tests/e2e` is intentionally excluded from the default `npm test` matcher, so run those separately through the project’s e2e workflow when needed. Coverage is collected into `coverage/`, primarily from `src/app/**/*`. Add or update tests for any API, service, or schema change.

## Commit & Pull Request Guidelines
Recent history uses short prefixes such as `FIX : ...` and `TEST : ...`. Keep commit subjects imperative, scoped, and consistent with that pattern. For pull requests, include a concise summary, the affected area, related issue or task link, and proof that `npm run build`, `npm run lint`, and `npm test` passed. Include request/response examples or screenshots when API behavior or docs change.

## Security & Configuration Tips
Do not commit real secrets from `.env`; use `.env.example` as the baseline and prefer the team secret manager for local runs. Review Docker, Prisma migrations, and external service settings carefully before merging infrastructure-facing changes.
