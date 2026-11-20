# Security fixes: evidence for retest

Responses to the findings in `SECURITY_REVIEW.md` (baseline `b6fdf61`). Fixes landed in commit `e29b356`. These are the developer's notes and evidence; each finding stays open until the security reviewer retests it.

Run the evidence suites with:

```bash
npx vitest run test/security.test.ts test/auth-handler.test.ts
```

`test/auth-handler.test.ts` drives the real Better Auth handler in production mode against the disposable test database (`data/test.db`, recreated each run), with synthetic `@uwaterloo.ca` and `example.invalid` addresses and a mocked mail sender. No email is sent.

## Note on `security/check-auth.mjs`

The probe transpiles a fixed list of files. Since the fix, `src/lib/auth.ts` also imports `src/lib/client-ip.ts` and `src/lib/rate-limit.ts`, and the schema has a new `rate_limit_bucket` table. Until the probe includes those, it fails with `ERR_MODULE_NOT_FOUND` for `lib/client-ip.mjs`. The probe's minimal schema also needs:

```sql
CREATE TABLE rate_limit_bucket (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, count INTEGER NOT NULL);
```

The probe's production-mode case without `SMTP_URL` now gets a 404, because the email-link endpoint is switched off rather than returning 200.

## SEC-001: production fallback wrote login links to logs

**Change**
- `src/lib/email.ts`: printing email to the console is allowed only when `NODE_ENV === "development"` (`next dev`). Otherwise, without `SMTP_URL`, `sendEmail` throws `EmailNotConfiguredError` and logs a fixed message with no recipient, subject, body or link.
- `src/lib/auth-policy.ts`: `emailLinkEnabled()` is false unless `SMTP_URL` is set or `NODE_ENV === "development"`. In production without SMTP, the magic-link plugin isn't registered, so `/api/auth/sign-in/magic-link` returns 404 and the sign-in page hides the email form.
- `src/lib/auth.ts`: if sending still fails as not configured, the request gets a 503 "Email sign-in is unavailable."

**Evidence**
- `auth-handler.test.ts` › "disables the email-link endpoint in production without SMTP": status 404, nothing sent, and nothing containing `magic-link/verify` logged.
- `security.test.ts` › "refuses to log emails outside development when SMTP is missing": `sendEmail` rejects, and the message body never reaches `console.log` or `console.error`.
- `security.test.ts` › "disables email-link sign-in in production without SMTP".

**Not covered:** the configured-SMTP production path against a controlled mailbox. That needs a real SMTP account.

## SEC-002: email abuse controls

**Change**
- **Trusted client IP** (`src/lib/client-ip.ts`): the IP is read only from the header named in `TRUSTED_IP_HEADER`. It must hold a single valid IP; lists and junk give "unknown". With no trusted header, the IP is unknown in production. Better Auth is configured with `advanced.ipAddress.ipAddressHeaders` set to that header only (or a placeholder header nobody sets), so a spoofed `x-forwarded-for` is never used.
- **Shared atomic limits** (`src/lib/rate-limit.ts`, table `rate_limit_bucket`): fixed-window counters updated by a single `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement. Better Auth uses them through `rateLimit.customStorage.consume`, and so do the app's own limits. They survive restarts and are shared by every process using the same database.
- **Email-link limits** (`sendMagicLink` in `src/lib/auth.ts`):
  1. **Per IP:** 20 per 10 min, counted before the address is validated, so rejected addresses use up the budget. Applies only when the IP is known.
  2. **Address validation:** the domain and `+` alias checks.
  3. **Global cap:** 500 per 10 min. This bounds total mail volume and the number of counter rows.
  4. **Per recipient:** 3 per 10 min and 10 per 24 h, whatever the source.
- **Rejected addresses** never become counter keys; only IPs and valid recipients do.
- **Unknown IP:** when the IP can't be determined, Better Auth's per-IP rules for `/sign-in/*` and `/magic-link/verify` are skipped instead of putting every user into one shared bucket. The per-recipient and global caps still apply.
- **Expired counters** are pruned occasionally.

**Evidence** (`auth-handler.test.ts`)
- "caps links per recipient no matter how forwarding headers change": five requests to one recipient, each with a different `x-forwarded-for`, give 200, 200, 200, 429, 429, and 3 emails are sent.
- "ignores spoofed x-forwarded-for when a trusted IP header is configured": 22 requests with the same `cf-connecting-ip` and a different `x-forwarded-for` and recipient each time give 20 × 200 followed by 429, 429. A different `cf-connecting-ip` still gets 200.
- "counts rejected addresses against the IP budget without storing them": 20 foreign addresses give 400 each, then a valid address from the same IP gets 429. No counter key contains the rejected domain.

**Also** (`security.test.ts`)
- "is atomic under parallel requests": 25 parallel requests against a limit of 5 let exactly 5 through.
- The client IP tests check that `x-forwarded-for` is ignored, and that lists and junk values are rejected.

**Not covered**
- Staging through the real ingress. This needs the deployment's proxy to set and overwrite `TRUSTED_IP_HEADER`, with direct access to the app server blocked.
- Multiple workers against one shared database. The single-statement upsert is designed for that, but it hasn't been tested.

## SEC-003: vulnerable development dependency chain

**Change:** `package.json` `overrides` pins `@esbuild-kit/core-utils` → `esbuild@^0.25.12`, which is past the GHSA-67mh-4wv8-2f99 fix (fixed in 0.25.0). `drizzle-kit` stays at 0.31.11; `npm audit fix --force` was not used.

**Evidence**
- `npm ls esbuild` shows `@esbuild-kit/core-utils` → `esbuild@0.25.12`.
- `npm audit` reports 0 vulnerabilities.
- `drizzle-kit push --force` against a disposable database (`DATABASE_URL=file:./data/sec003.db`) applied the schema. The vitest global setup runs the same command on every test run.

**Usage note:** drizzle-kit is used only from the command line (`db:push`, `db:studio`). The project doesn't use esbuild's serve API.
