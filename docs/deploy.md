# Deploying Wattle

Wattle runs on **Vercel** (hosting) with **Supabase** (Postgres database). Both free plans are enough to start. Vercel's free Hobby plan is for non-commercial projects, which a student project with no ads is.

## 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com). Pick the region closest to your Vercel region, e.g. Canada (Central) or US East.
2. Under **Project Settings → Database → Connection string**, copy two URLs and replace `[YOUR-PASSWORD]` in each:
   - **Transaction pooler** (port 6543): becomes `DATABASE_URL`, which the app uses.
   - **Direct connection** (port 5432): becomes `DATABASE_MIGRATION_URL`, used only to create and update tables.

You don't run migrations by hand: every **production** deploy on Vercel applies any new files in `drizzle/` first (`scripts/migrate.mjs`). Preview deploys never touch the database.

## 2. Vercel

1. At [vercel.com/new](https://vercel.com/new), import the `Wattle` GitHub repository. The defaults are right (framework Next.js; Vercel runs `npm run vercel-build`, which migrates and then builds).
2. Before the first deploy, add these **Environment Variables** (Production):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL (port 6543) |
| `DATABASE_MIGRATION_URL` | Supabase direct connection URL (port 5432) |
| `BETTER_AUTH_URL` | Your public URL, e.g. `https://wattle.example`. No trailing slash. |
| `BETTER_AUTH_SECRET` | Output of `openssl rand -base64 32` |
| `PUZZLE_SECRET` | Output of `openssl rand -base64 32`. Keep it stable: changing it changes future puzzles. |
| `CRON_SECRET` | Output of `openssl rand -base64 32`. Vercel sends it to the daily job. |
| `TRUSTED_IP_HEADER` | `x-real-ip` (Vercel sets this to the real client IP) |
| `CONTENT_KEY` | The key that decrypts the puzzle banks in `content/encrypted/` (it's in your `.env.local`) |
| `SMTP_URL`, `EMAIL_FROM` | **Required.** Students verify their email with a code. Use an email provider such as Resend, sending from your domain. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Optional "Continue with Microsoft"; see the README |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional "Continue with Google"; see the README |

3. Deploy. The build log should show `[migrate] Database is up to date.`

On startup, the server checks these settings (`src/lib/config-check.ts`). It refuses to start on errors (a missing or short secret, a non-https URL, a non-Postgres database, no `SMTP_URL`) and logs warnings for risky ones. Check **Logs** in Vercel after the first deploy.

### Daily job

`vercel.json` schedules `/api/cron/daily` every day at 05:15 UTC (shortly after midnight Toronto time; Hobby plans may run it any time within that hour). It:
- creates the day's puzzle before the first player arrives,
- clears expired rate-limit counters, and
- keeps the Supabase free-tier database active so it never pauses.

It only runs when called with `CRON_SECRET`, so nobody else can trigger it. To check it, open **Settings → Cron Jobs** in Vercel and click **Run**.

## 3. Domain

1. Buy a domain and add it under **Settings → Domains** in Vercel; it shows you the DNS records to set.
2. Update `BETTER_AUTH_URL` to `https://<your-domain>` and redeploy.
3. Add the production redirect URIs, if you use these sign-in options:
   - Azure app registration: `https://<your-domain>/api/auth/callback/microsoft`
   - Google OAuth client: `https://<your-domain>/api/auth/callback/google`
4. With your email provider, verify the domain (it gives you DNS records), so codes come from your domain and don't land in junk.

Sign-in only works on the production domain, not on preview deployment URLs.

## 4. Puzzle content

Puzzles generate themselves daily. The Quads and Deep Cut banks are committed encrypted in `content/encrypted/`, and the server decrypts them with `CONTENT_KEY`. See [content.md](content.md) for how to edit them.

## Checklist before inviting students

- [ ] The first production deploy logs `[migrate] Database is up to date.` and no `[config]` errors.
- [ ] Running the daily job from **Settings → Cron Jobs** returns the day's puzzle as ready.
- [ ] A code email arrives in a `@uwaterloo.ca` inbox (not junk), and signing in with it works.
- [ ] Microsoft and Google sign-in (if enabled) work, and then ask for a student email.
- [ ] `CONTENT_KEY` is set on Vercel, and `npm run content:check` passes locally.
- [ ] You have a backup plan: Supabase's free plan has no automatic backups, but `pg_dump` with the direct connection URL works.
- [ ] The security reviewer has retested the open findings.
