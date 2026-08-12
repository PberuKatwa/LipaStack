# AGENTS.md

## Project

NestJS (v11) + TypeScript (v5.7) backend. Node package manager: npm.

## Commands

- Build (typechecks): `npm run build`
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`
- Format check: `npm run format:check`
- Format: `npm run format`
- All quality gates: `npm run check`
- Run dev server: `npm run start:dev`

## Type Safety (strict, non-negotiable)

`tsconfig.json` runs with `strict`, `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`, and `noUnusedParameters` all enabled. Agents must:

- Never use `any`. Use `unknown` plus narrowing when the type is truly unknown.
- Never use non-null assertions (`!`), `as` type assertions, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `// eslint-disable` to silence type or lint errors. Fix the root cause instead.
- Never loosen `tsconfig.json` compiler options.
- Always handle `undefined` for possibly-missing values (indexed access, optional properties, `Map.get`, `Array.find`, etc.).
- Every function parameter, return value, class property, and DTO must have an explicit type. No implicit reliance on inference for public APIs.

## Quality Gates (must pass before finishing any task)

After any code change, run all of the following and ensure they exit 0:


1. `npm run check` (lint + prettier check)
2. `npm run stylecheck` (prettier/style check)

If a gate fails, fix the code — do not disable rules, skip checks, or weaken configuration.

## Git (forbidden)

Agents must NEVER run any git operations. This includes but is not limited to: `git status`, `git add`, `git commit`, `git push`, `git checkout`, `git switch`, `git branch`, `git merge`, `git rebase`, `git stash`, `git reset`, `git fetch`, `git pull`, `git tag`, and any other `git` subcommand. Version control is handled exclusively by the user.

## Env Files (forbidden)

Agents must NEVER read, open, or modify any env files (`.env`, `.env.*`, and any per-environment variants). The only exception is `.env.example`, which may be read to understand expected variable names.

## Environment Variables

All environment variable handling lives in `src/config/`:

- `src/config/env.types.ts` — zod schemas (`globalEnvironmentSchema`, `paystackEnvironmentSchema`) and types derived from them via `z.infer`.
- `src/config/env.config.ts` — config factories (`globalConfig`, `paystackConfig`) that read raw `process.env` values and parse them through the schemas. This is the ONLY place `process.env` may be touched.
- `src/config/env.utils.ts` — `parseEnvZod`, the shared `safeParse` wrapper that throws a readable error on invalid values.

Rules (non-negotiable):

- Never access `process.env` anywhere outside `src/config/env.config.ts`. Environment values must always be consumed through the parsed, typed config (via `ConfigService` or the typed config objects), never read raw.
- Every env field must be defined in a zod schema; types are derived from schemas, never declared manually.

To add a new environment variable:

1. Add the field to the relevant zod schema in `src/config/env.types.ts` (or create a new schema and derive its type with `z.infer`).
2. Wire the raw value in `src/config/env.config.ts` using `getEnv(...)` inside the corresponding `parseEnvZod(schema, {...}, label)` call. Remember that keys are suffixed with the environment (e.g. `PORT_DEVELOPMENT`), so pass the base key (e.g. `PORT`).
3. Add the variable (both `_DEVELOPMENT` and `_PRODUCTION` variants) to `.env.example` with a sensible default or empty value.
4. The user must add the real values to their own `.env` file.

## Comments (forbidden)

Agents must NEVER write comments in code. This includes inline comments, block comments, JSDoc/TSDoc, and TODO/FIXME markers. Code must be self-documenting through clear naming. Do not remove or modify existing comments unless explicitly asked.
