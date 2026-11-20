# Deploying Wattle

Wattle is a standard Next.js server (`npm run build`, then `npm start`) with a libSQL database. Any host that runs a Node.js server works, e.g. Render, Railway, Fly.io or a small VPS. Serverless-only hosts also work, but then the database must be hosted (Turso) rather than a file.

## 1. Database

Use a hosted libSQL database, e.g. [Turso](https://turso.tech):

```bash
turso db create wattle
turso db show wattle --url
turso db tokens create wattle
```

Set `DATABASE_URL` (the `libsql://…` URL) and `DATABASE_AUTH_TOKEN`, then create the tables from the committed migrations:

```bash
DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
```

Run `npm run db:migrate` again after pulling changes that add files to `drizzle/`. After changing `src/db/schema.ts`, create a new migration with `npm run db:generate` and commit it. Local development can keep using `npm run db:push`.

A single server with a SQLite file (`DATABASE_URL=file:/data/wattle.db` on a persistent disk) also works for a small test. The startup check warns about it, since it can't be shared between instances.

## 2. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `BETTER_AUTH_URL` | yes | Public URL, `https://…`, no trailing slash |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `PUZZLE_SECRET` | yes | `openssl rand -base64 32`. Changing it changes future puzzles, so keep it stable. |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | yes | See above |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | for Microsoft sign-in | From the Azure app registration |
| `MICROSOFT_TENANT_ID` | with Microsoft | Waterloo's tenant: `723a5a87-f39a-4a22-9247-3fc240c01396` |
| `SMTP_URL`, `EMAIL_FROM` | for email links | e.g. a transactional email provider's SMTP. Without it, email links are off. |
| `AUTH_EMAIL_LINK_ENABLED` | no | `false` to offer Microsoft sign-in only |
| `TRUSTED_IP_HEADER` | recommended | The header your host's proxy sets to the client IP and overwrites (Cloudflare: `cf-connecting-ip`, Fly.io: `fly-client-ip`). Leave it empty if unsure; never use a header clients can set themselves. |
| `ALLOWED_EMAIL_DOMAINS` | no | Defaults to `uwaterloo.ca` |

At least one sign-in method must be configured. On startup, the server checks these settings (`src/instrumentation.ts`). It refuses to start on errors such as a missing or short secret, a non-https URL, no sign-in method, or Microsoft sign-in without the tenant, and it logs warnings for risky settings.

## 3. Microsoft sign-in

In the Azure app registration (see the README), add the production redirect URI:

```
https://<your-domain>/api/auth/callback/microsoft
```

## 4. Puzzle content

The example puzzles in `content/examples/` are public on GitHub. For real use, put the real files on the server (not in git) at:

- `content/private/quads.json`
- `content/private/deepcut.json`

They use the same format as the examples. Check them before deploying:

```bash
npm run content:check
```

Honk, Hot & Cold and Sharp need no private content: their answers come from public lists, with the daily pick decided by `PUZZLE_SECRET`.

## 5. Build and run

```bash
npm ci
npm run build
npm start
```

`npm start` listens on port 3000 by default (`PORT` changes it). Put the host's HTTPS proxy in front. The app sends security headers itself (CSP, HSTS, frame blocking).

## Checklist before inviting students

- [ ] `npm start` logs no `[config]` errors, and you've reviewed any warnings.
- [ ] Microsoft sign-in works with a Waterloo account, and a personal Microsoft account is rejected.
- [ ] If email links are enabled, a link arrives in a `@uwaterloo.ca` inbox and not in junk.
- [ ] Real puzzle content is in `content/private/`, and `npm run content:check` passes.
- [ ] The database is backed up (Turso keeps backups on paid plans; otherwise copy the file).
- [ ] The security reviewer has retested the open findings.
