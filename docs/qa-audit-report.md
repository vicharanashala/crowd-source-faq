# Comprehensive QA, Testing & Security Audit — Yaksha / CSFAQ

**Auditor:** Senior QA / Security review
**Date started:** 2026-06-30
**Branch:** `qa/comprehensive-audit` (off `origin/main`)
**Scope:** MERN monorepo — `apps/backend` (Express + Mongoose), `apps/frontend` (React/Vite), shared `packages/*`. OWASP Top 10, authn/authz, input validation, reliability, and test coverage.

> A prior frontend RBAC audit (`audit-findings.md`) closed 27/28 findings. This audit extends coverage to the **backend, security posture, dependency supply chain, and test suites**, and is organised into milestones.

---

## Severity legend
| Severity | Meaning |
|----------|---------|
| 🔴 Critical | Exploitable now; data loss, RCE, auth bypass, or privilege escalation |
| 🟠 High | Serious security/correctness defect; likely exploitable or breaks a core flow |
| 🟡 Medium | Real defect with limited blast radius or requiring preconditions |
| 🔵 Low | Hardening, code quality, or defensive improvement |

---

## Milestone 1 — Baseline Health ✅

Established the factual starting state of the toolchain before changing anything.

| Check | Command | Result |
|-------|---------|--------|
| Backend unit/integration tests | `vitest run` | ✅ **230 passed** (10 files) |
| Frontend unit tests | `vitest run` | ✅ **23 passed** (3 files) |
| Backend typecheck | `tsc --noEmit` | ✅ clean (exit 0) |
| Frontend typecheck | `tsc --noEmit` | ✅ clean (exit 0) |
| Backend build | `tsc` | ✅ clean (exit 0) |
| Frontend build | `vite build` | ✅ clean (built in ~5.5s) |
| Lint | `eslint . --ext .ts,.tsx` | ⚠️ **65 errors, 124 warnings** |
| Dependency audit | `pnpm audit` | ⚠️ **2 critical, 9 high, 10 moderate, 2 low** |

### 1a. Lint findings (errors grouped by rule)
| Count | Rule | Nature |
|-------|------|--------|
| 18 | `no-useless-escape` | Regex over-escaping — cosmetic, low risk |
| 14 | `no-empty` | Empty `catch {}` blocks — **swallowed errors**, worth review |
| 12 | `@typescript-eslint/ban-types` | `{}`/`Function` types — type-safety smell |
| 7 | `react-hooks/exhaustive-deps` | **Rule referenced by inline disables but plugin not configured** → ESLint hard-errors |
| 6 | `@typescript-eslint/ban-ts-comment` | `@ts-nocheck`/`@ts-ignore` masking type errors |
| 2 | `no-control-regex` | Control chars in regex (sanitisation code — verify intent) |
| 2 each | `prefer-const`, `no-extra-semi` | Cosmetic |
| 1 each | `no-var-requires`, `no-namespace` | Minor |

124 warnings are almost entirely `@typescript-eslint/no-unused-vars` (dead imports/vars).

**Key takeaway:** `eslint-plugin-react-hooks` is not installed/registered, yet code contains `// eslint-disable-next-line react-hooks/exhaustive-deps` comments — so lint *errors out* on the missing rule. The repo `lint` script is effectively red in CI. (See Milestone 2 fixes.)

### 1b. Dependency vulnerabilities (supply chain)
| Severity | Package | Vulnerable | Notes |
|----------|---------|-----------|-------|
| 🔴 critical | `protobufjs` | <7.5.5 | Arbitrary code execution / code injection — transitive (GCP/openai SDKs) |
| 🔴 critical | `vitest` | <3.2.6 | UI server arbitrary file read+exec — **dev-only** (UI not used in CI) |
| 🟠 high | `xlsx` | <0.19.3 | Prototype pollution — confirm if actually imported |
| 🟠 high | `undici` | <6.27.0 | WebSocket DoS + header injection — transitive |
| 🟠 high | `vite` | <=6.4.2 | `server.fs.deny` bypass on Windows — **dev-only** |
| 🟡 moderate | `esbuild`, `uuid`, `undici` | various | `uuid` is a runtime dep; esbuild/vite dev-only |

**Triage stance:** dev-only build tooling (vite/vitest/esbuild) is lower real-world risk for a deployed server but should still be bumped. Runtime/transitive (`protobufjs`, `undici`, `uuid`, `xlsx`) are the priority. Detailed remediation in Milestone 4.

---
## Milestone 2 — Backend Security Audit (OWASP-focused) ✅

Reviewed the authn/authz stack, request validation, injection surface, file
upload, rate limiting, and the pending frontend finding (`H6`). **Headline: the
backend is already well-hardened.** Most OWASP categories are addressed by
existing controls; findings below are the genuine gaps, with severity.

### What is solid (verified, no action needed)
- **AuthN** (`middleware/authShared.ts`): Bearer JWT verify → server-side `jti`
  revocation blocklist → banned/deleted/suspended checks on every protected
  request. Refresh-token rotation with reuse-breach detection (tested).
- **AuthZ / IDOR (OWASP A01)**: community mutations (`updatePost`, `deletePost`,
  `setPostDNA`, `setPostTags`) all enforce `isAuthor || isPrivileged`, plus a
  program-scope guard. Admin user-management routes use `authorize('admin')`.
- **Injection (A03)**: all sensitive routes run `validateBody(zodSchema)` which
  requires `string`/ObjectId-shaped fields — operator objects (`{$ne:…}`) are
  rejected, neutralising NoSQL injection. No `find(req.body)`/`$where` patterns.
- **Auth failures (A07)**: bcrypt password compare, generic "invalid email or
  password" (no user enumeration), login rate-limited per email+IP.
- **H6 (prior audit, "CommunityPage no server-side auth")** — **NOT a vuln.**
  `POST /api/community` is `protect`-guarded server-side; the frontend was only
  UI-gated. **Resolved/verified — close it.**
- **File upload (A08)**: no bytes through the API — signed GCS PUT URLs with
  allowlisted subfolders + MIME types, server-controlled object path, 15-min TTL.
- **Rate limiting**: Redis-backed (`rate-limit-redis`) with in-memory fallback,
  per-identity keys; login/register/password/2FA/admin all covered.

### Findings

| ID | Sev | OWASP | Finding | Status |
|----|-----|-------|---------|--------|
| S1 | 🟠 High | A06 | **Vulnerable dependencies** — `protobufjs` (critical RCE, transitive), `undici` (high), `xlsx` (high), `uuid` (moderate runtime). Plus dev-only `vite`/`vitest`/`esbuild`. | 📋 Documented (M4 plan) |
| S2 | 🟡 Med | A07 | **Weak password policy** — `min(6)`, no composition, and the backend register schema had **no max length**. Trivial passwords accepted. | ✅ **Fixed (M3)** |
| S3 | 🟡 Med | — | **Lint is red in CI** — orphaned `react-hooks/exhaustive-deps` disable directives reference a plugin that isn't installed → ESLint hard-errors (7 errors). Masks real hook-dependency issues. | 📋 Documented (fix = install plugin) |
| S4 | 🔵 Low | A05 | **CORS reflects any origin with credentials** (`origin:true`). Low impact today (auth is Bearer-header, not cookie-based — only a guest-tracking cookie exists), but unsafe if cookies are ever added. | ✅ **Hardened (M3)** |
| S5 | 🔵 Low | A03 | **Regex-based HTML sanitizer** (`sanitizeHtml`) is fragile vs. a vetted library; safe today only because React escapes on render. | 📋 Documented + pinned by tests |
| S6 | 🔵 Low | — | **14 empty `catch {}` blocks** swallow errors silently; **6 `@ts-nocheck`/`@ts-ignore`** mask type errors. | 📋 Documented |
| S7 | 🔵 Low | — | **Schema duplication** — password rules lived in 3 places (shared pkg, backend, frontend), all `min(6)`; drift risk. | ✅ De-duplicated to a shared `passwordPolicy` (M3) |

---

## Milestone 3 — Remediation (applied, non-breaking) ✅

All changes are backward-compatible and covered by tests/builds.

1. **Password policy hardened (S2, S7).**
   New shared `passwordPolicy` = **min 8, max 128, ≥1 letter + ≥1 digit**, applied to:
   - `apps/backend/src/utils/auth/validation.ts` (`registerSchema`, `changePasswordSchema`) — the enforcement point.
   - `packages/validation/src/schemas/auth.schema.ts` — shared source of truth.
   - `apps/frontend/src/components/auth/AuthModal.tsx` — matching client-side check + message.
   - **`loginSchema` deliberately left at `min(1)`** so existing accounts created under the old rule are never locked out; the new policy applies only on register / password-change.

2. **CORS hardened (S4).**
   `apps/backend/src/bootstrap/middleware.ts` now supports an env allowlist:
   set `CORS_ALLOWED_ORIGINS=https://a.com,https://b.com` to restrict credentialed
   CORS to those origins (requests with no `Origin` still allowed). **Default
   behaviour is unchanged** when the env var is unset, so the current
   single-container deployment is not affected.

---

## Milestone 4 — Tests Added & Verified ✅

New, dependency-free unit suites that lock in the security properties above
(run under the existing `vitest` setup — no DB, no new packages):

| File | Tests | Covers |
|------|-------|--------|
| `apps/backend/src/utils/auth/__tests__/validation.schema.test.ts` | 12 | Password policy (accept/reject, length bound), **NoSQL-injection resistance** (operator objects rejected), **mass-assignment** (`role`/`isBanned` stripped), ObjectId guards |
| `apps/backend/src/utils/http/__tests__/sanitize.test.ts` | 15 | `sanitizeHtml`/`stripHtml`/`sanitizeText` tag+control-char stripping, `sanitizeRegex` ReDoS escaping, `sanitizeEmail`, `sanitizeBase64`, `sanitizePathSegment` traversal block |

### Post-change verification (re-run)
| Check | Result |
|-------|--------|
| Backend tests | ✅ **257 passed** (was 230; +27 new) |
| Frontend tests | ✅ 23 passed |
| Backend typecheck | ✅ clean |
| Frontend typecheck | ✅ clean |
| Frontend build | ✅ clean |
| Backend build | ✅ clean |

---

## Recommendations not auto-applied (need a judgement call / install / infra)

These are deliberately **not** in the PR because they carry product, dependency,
or behavioural risk that warrants a maintainer decision:

1. **Dependency bumps (S1)** — run `pnpm update` for `undici`, `uuid`, and force
   a resolution for transitive `protobufjs` ≥7.5.5; bump `vite`/`vitest`/`esbuild`
   in a dedicated PR with the suite green. Not bundled here to avoid a noisy
   lockfile churn mixed with security fixes.
2. **Install `eslint-plugin-react-hooks` (S3)** — add to root devDeps and enable
   `plugin:react-hooks/recommended` for the frontend; this both clears the 7
   lint errors and surfaces the real hook-dependency warnings the orphaned
   directives were hiding.
3. **Replace the regex HTML sanitizer (S5)** with a vetted library (e.g.
   `sanitize-html` server-side or DOMPurify at render) if rich text is ever
   stored unescaped.
4. **Lint cleanup (S6)** — triage the 14 empty catch blocks (log or rethrow) and
   the 6 `@ts-nocheck` files; ~124 unused-var warnings are mechanical.

---

## Audit scope note (honesty about coverage)

This pass prioritised the **highest-risk surfaces** of a large codebase
(200+ backend modules): the auth/authz core, request validation, injection
surface, file upload, rate limiting, CORS, and the dependency supply chain.
Lower-risk areas (Discord/Zoom integrations, AI pipeline internals, admin
analytics) were reviewed at the routing/authorization level but not
line-by-line. The test additions target security-critical pure logic where
regression risk is highest and tests are deterministic (no external services).

