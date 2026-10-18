# NPM Release Plan

## Scope

This document lists everything that must be true before `paystack-kit` is published to the public npm registry as `0.1.0`.

It covers release identity, package metadata, build artifacts, documentation, licensing, quality gates, publish infrastructure, and pre-flight verification. It does not cover SDK feature work or endpoint coverage except where those directly block a release. Anything not required to publish is listed under Deferred.

The first release is a framework-agnostic, minimum-surface package: `PaystackClient` with `transactions.initialize` / `transactions.verify`, `charge.createMobileMoney` / `charge.checkPending`, standalone webhook `verifySignature` / `constructEvent`, the pure helpers (`normalizeKenyanPhone`, `toSubunit`, `fromSubunit`), the error taxonomy, and all inferred types.

## Release Identity

| Item | Value |
| --- | --- |
| Package name | `paystack-kit` |
| First version | `0.1.0` |
| License | MIT |
| Registry | Public npm (`https://registry.npmjs.org`) |
| Layout | npm workspace at `packages/paystack` |
| Node engines | `>=20` |
| Runtime dependency | `zod` only |
| Git tag format | `paystack-kit@0.1.0` |

The name was verified unclaimed during planning. Registry names are first-come-first-served, so re-verify immediately before the first publish with `npm view paystack-kit`. If it has been taken by then, publish under the `@lipastack` scope instead and adjust the name field.

## Current State vs Required

| Requirement | Current state |
| --- | --- |
| Workspace | Missing. Root `package.json` has no `workspaces` field. |
| Package location | Missing. The repository root is the NestJS application; `api-client/` is empty and gitignored. |
| Package metadata | Missing. No `packages/paystack/package.json` exists. |
| License | Missing. The root package is `UNLICENSED` and no `LICENSE` file exists anywhere. |
| Library build | Missing. Only `nest build` (application output) is configured. |
| Package README | Missing. The root README is the NestJS starter boilerplate. |
| Quality gate coverage | Gap. Prettier and ESLint globs match only `src/` (and `apps`, `libs`), so `packages/**` currently escapes `npm run check`. |
| CI release job | Missing. `.github/workflows/ci.yml` lints, style-checks, and builds the app only. |
| Publish workflow | Missing. |
| Smoke verification | Not performed. |
| Name availability | Free as of planning. |

## Requirements

### 1. Workspace and package location

- Root `package.json` gains `"workspaces": ["packages/*"]`.
- The root package stays `"private": true`, so an accidental publish from the repository root is impossible.
- The package lives at `packages/paystack/` with its own `package.json` that is not private.
- `packages/paystack/dist` is added to `.gitignore`.
- Nothing reachable from the package directory may include `.env`, logs, or application code. The `files` allowlist below enforces this at pack time.

### 2. Package metadata

Target `packages/paystack/package.json` skeleton. Every field is deliberate.

```json
{
  "name": "paystack-kit",
  "version": "0.1.0",
  "description": "Framework-agnostic TypeScript client for the Paystack API with first-class M-Pesa STK push and webhook verification. Unofficial; not affiliated with Paystack.",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "main": "./dist/index.cjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": [
    "dist"
  ],
  "sideEffects": false,
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<owner>/<repo>.git"
  },
  "homepage": "https://github.com/<owner>/<repo>#readme",
  "bugs": {
    "url": "https://github.com/<owner>/<repo>/issues"
  },
  "keywords": [
    "paystack",
    "mpesa",
    "stk-push",
    "mobile-money",
    "payments",
    "kenya",
    "webhooks",
    "sdk"
  ],
  "scripts": {
    "build": "tsup",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "tsup": "^8.0.0"
  }
}
```

Rules:

- `private` must be absent. Its presence blocks publishing.
- `files: ["dist"]` is an allowlist. README and LICENSE are always included by npm. Source, configs, and env files must never ship.
- `repository` must match the actual GitHub repository that will run the publish workflow. npm provenance attestation is tied to it and publication fails on a mismatch. Replace every `<owner>/<repo>` placeholder with the real values.
- `prepublishOnly` runs the build, so a stale or missing `dist` cannot be published.
- No `peerDependencies`. The package is framework-agnostic and depends on nothing but `zod`.
- `description` appears in npm search results and on the package page. It already contains the unofficial-package disclaimer.

### 3. Build artifacts

- The package build uses `tsup` with `format: ['esm', 'cjs']`, `dts: true`, `sourcemap: true`, `clean: true`.
- With `"type": "module"`, the expected outputs are `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts`, and `dist/index.d.cts`.
- Every public symbol is exported from the single entry point `src/index.ts`. Nothing is importable that is not exported there.
- Declarations must resolve from a consumer project under both `moduleResolution: node16` and `moduleResolution: bundler`. This is verified in the pre-flight smoke step, optionally with `npx @arethetypeswrong/cli --pack packages/paystack`.
- The NestJS application build (`nest build`) is irrelevant to the package and must not be referenced by its `files` or scripts.

### 4. Documentation

The README in `packages/paystack/README.md` is the npm landing page and must contain:

- One-line description and an explicit "unofficial, not affiliated with Paystack" disclaimer.
- Install command: `npm install paystack-kit`.
- Quickstart: client construction with a secret key, a `transactions.verify` call.
- M-Pesa STK push example: `charge.createMobileMoney` plus `charge.checkPending` polling.
- Webhook verification section using `verifySignature` / `constructEvent`, with raw-body preservation examples for Express (`express.json({ verify })`), Fastify, and raw Node HTTP. This is the single most common integration failure point and must be shown, not described.
- Exported API list, error class reference, and Node version requirement.
- License section referencing MIT.

The README must not contain any real secret key, even a test one.

### 5. Licensing

- `packages/paystack/LICENSE` contains the full MIT license text.
- `packages/paystack/package.json` sets `"license": "MIT"`.
- The root application's `UNLICENSED` field is unrelated and must not be copied into the package.

### 6. Quality gates

- The root prettier and ESLint globs must include `packages/**/*.ts`; otherwise `npm run check` silently skips the package and the release gate is meaningless.
- `npm run check` and the package build must both exit 0 at the exact commit that is tagged for release.
- The repository's existing CI workflow must build the package and run `npm pack --dry-run --workspace paystack-kit` so packaging regressions are caught before a tag exists.

### 7. Name claim

- Re-verify `paystack-kit` is still unclaimed immediately before publishing.
- The first publish claims the name. Do not leave the release pending after verifying availability.

## Publish Infrastructure

### CI additions (`.github/workflows/ci.yml`)

Add to the existing job, after the current steps:

```yaml
      - name: Build package
        run: npm run build --workspace paystack-kit

      - name: Verify package contents
        run: npm pack --dry-run --workspace paystack-kit
```

### Publish workflow (`.github/workflows/publish.yml`)

```yaml
name: Publish

on:
  push:
    tags:
      - 'paystack-kit@*'

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Publish
        run: npm publish --workspace paystack-kit --provenance
```

Rules:

- `id-token: write` is mandatory for provenance. Publishing from a local machine cannot produce an attestation and is not the release path.
- Prefer npm Trusted Publishing (OIDC) linked to this GitHub repository. If the account is not configured for it, use a granular automation token stored as a repository secret and switch to trusted publishing afterwards. The npm account must have 2FA enabled.
- The workflow triggers only on `paystack-kit@*` tags so unrelated tags cannot publish.
- Unscoped packages need no `--access` flag; `publishConfig.access` is kept for a future scoped rename.

## Pre-Flight Verification

All steps run after a successful local build and before the release tag is pushed.

### 1. Tarball inspection

```bash
npm pack --workspace paystack-kit
tar -tzf paystack-kit-0.1.0.tgz
```

Confirm the file list contains only `package/dist/**`, `package/README.md`, `package/LICENSE`, and `package/package.json`. Any `.env`, log, source, or config entry blocks the release.

### 2. Consumer smoke test

```bash
mkdir -p /tmp/opencode/paystack-kit-smoke
cd /tmp/opencode/paystack-kit-smoke
npm init -y
npm install /home/pberu/Documents/Projects/LipaStack/paystack-kit-0.1.0.tgz
```

Then confirm both module systems resolve:

```bash
node -e "console.log(typeof require('paystack-kit').verifySignature)"
node --input-type=module -e "import { verifySignature } from 'paystack-kit'; console.log(typeof verifySignature)"
```

Then confirm declaration resolution by installing TypeScript locally and compiling a scratch file twice, once with `--moduleResolution nodenext` and once with `--moduleResolution bundler`.

### 3. Signature verification smoke

```bash
node --input-type=module <<'EOF'
import { createHmac } from 'node:crypto';
import { verifySignature } from 'paystack-kit';

const secret = process.env.PAYSTACK_SECRET_KEY;
if (!secret) throw new Error('PAYSTACK_SECRET_KEY is required');

const body = '{"event":"charge.success","data":{"reference":"ref_1"}}';
const signature = createHmac('sha512', secret).update(body).digest('hex');

console.log('valid body:', verifySignature(body, signature, secret) === true);
console.log('tampered body:', verifySignature(`${body} `, signature, secret) === false);
EOF
```

The secret key is supplied by the operator as an environment variable in the session shell. It must never be written to a file in the repository.

### 4. Live test-key smoke

```bash
node --input-type=module <<'EOF'
import { PaystackClient } from 'paystack-kit';

const secretKey = process.env.PAYSTACK_SECRET_KEY;
const reference = process.env.PAYSTACK_TEST_REFERENCE;
if (!secretKey || !reference) throw new Error('PAYSTACK_SECRET_KEY and PAYSTACK_TEST_REFERENCE are required');

const client = new PaystackClient({ secretKey });
const result = await client.transactions.verify(reference);
console.log(result.reference, result.status);
EOF
```

The key must be a Paystack test secret key (`sk_test_...`). A live key must never be used for release verification.

## Pre-Publish Checklist

- [ ] `paystack-kit` re-verified as unclaimed on the registry
- [ ] Root `workspaces` field added; root remains `private`
- [ ] `packages/paystack/package.json` complete, not private, version `0.1.0`
- [ ] `repository`/`homepage`/`bugs` contain real URLs, not placeholders
- [ ] `LICENSE` file present and `license` field is `MIT`
- [ ] `files` allowlist verified via tarball inspection
- [ ] Dual ESM/CJS build and declarations verified in a scratch consumer
- [ ] README complete, including the unofficial-package disclaimer and raw-body examples
- [ ] Prettier and ESLint globs cover `packages/**`
- [ ] `npm run check` exits 0 on the release commit
- [ ] CI workflow updated with package build and pack verification
- [ ] Publish workflow present, tag-filtered, with `id-token: write`
- [ ] npm account has 2FA enabled and publishing credentials configured
- [ ] All pre-flight smoke steps pass
- [ ] Tag `paystack-kit@0.1.0` pushed by the user
- [ ] Post-publish: registry page renders the README, provenance attestation is visible, and a fresh `npm install paystack-kit@0.1.0` in a clean directory resolves

## Owner Action Items

These cannot be performed by an agent:

| Action | Owner |
| --- | --- |
| Provide the real GitHub repository URL | User |
| Own the npm account, 2FA, and trusted publishing or token setup | User |
| Supply `PAYSTACK_SECRET_KEY` and `PAYSTACK_TEST_REFERENCE` at smoke time | User |
| Create and push the release tag (agents never run git operations) | User |

## Versioning After 0.1.0

- The package stays `0.x` until the public API is stable. Within `0.x`, minor versions may contain breaking changes.
- Every published version is tagged as `paystack-kit@x.y.z`.
- A changelog is deferred until the second release; the GitHub releases page can carry notes until then.

## Deferred

Not required to publish `0.1.0`:

- Test suite and test framework. The pre-flight verification above is the temporary substitute. Verification coverage should be replaced by automated tests before `1.0.0`.
- NestJS adapter package (for example `@lipastack/nestjs`).
- Additional endpoint groups, pagination helpers, retry and rate-limit handling.
- Idempotency utilities.
- Changelog automation and additional release tooling.
- Migrating the LipaStack application to consume the package. Strongly recommended before publishing as real-world validation, but not a publishing requirement.
