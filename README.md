# Wattle

Daily games for university students, with leaderboards for each campus and campus vs campus. One game each weekday:

| Day | Game | Mechanic |
| --- | --- | --- |
| Mon | Deep Cut | Rarity trivia: rarer correct answers score more |
| Tue | Honk | Five-letter word guess |
| Wed | Quads | Sort 16 words into 4 groups |
| Thu | Hot & Cold | Guess the country by proximity |
| Fri | Sharp | Five perception tests |

Puzzle days roll over at midnight Toronto time. No games on weekends.

## Stack

- Next.js 16 (App Router, Cache Components) + Tailwind CSS 4
- Drizzle ORM on Postgres: Supabase in production, an embedded Postgres (PGlite) for local development and tests, so nothing needs installing

## Running locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` applies migrations to the local database in `data/pglite`, starts it as a Postgres server on port 5433, then starts Next.js. To use another port, run `PORT=3001 npm run dev`.

Then open http://localhost:3000.

## Sign-in

Wattle is for university students: every player verifies a student email with a 6-digit code. Students can sign in three ways:

- **Student email + code:** enter your student email and type the 6-digit code from your inbox. This also verifies the student email. Codes are used instead of links because university mail scanners open links, which would use up one-time links.
- **Continue with Microsoft** or **Continue with Google:** any account, personal or school. Afterwards you enter your student email and type the code once.

Rules, all enforced on the server:
- Only student emails of participating universities count, and `+` aliases are rejected. The email's domain decides the player's university.
- Each student email can belong to only one Wattle account.
- Accounts are never merged by matching email addresses: each sign-in method is its own account. This closes a known attack where an OAuth provider lets someone set an email address they don't own.
- Codes expire after 10 minutes and are limited per inbox, per IP and overall. Sign-in codes allow 3 tries; student-email codes allow 5.
- Without `SMTP_URL`, `npm run dev` prints codes to the console. Production requires SMTP.

After verifying, players pick a leaderboard name and a faculty from their university's list. The faculty can't be changed later.

### Universities

Participating universities, with their student email domains and faculties, are listed in `src/lib/universities.ts`. To add one, add an entry and deploy. Every university plays the same daily puzzles, so scores compare fairly. To open only some of them, set `ENABLED_UNIVERSITIES`, e.g. `uwaterloo,utoronto`.

### Setting up Microsoft sign-in (optional)

1. Sign in to the [Azure portal](https://portal.azure.com) with a personal Microsoft account. Open **Microsoft Entra ID → App registrations → New registration**.
2. Name: `Wattle`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Web**, value `http://localhost:3000/api/auth/callback/microsoft`. Add the production URL later.
4. Copy the **Application (client) ID** into `MICROSOFT_CLIENT_ID`, and a new client secret's **Value** (under **Certificates & secrets**) into `MICROSOFT_CLIENT_SECRET`.

### Setting up Google sign-in (optional)

1. In the [Google Cloud console](https://console.cloud.google.com), create a project, then open **APIs & Services → OAuth consent screen**. Choose **External** and add your app name and email.
2. Under **Credentials → Create credentials → OAuth client ID**, choose **Web application**. Add the redirect URI `http://localhost:3000/api/auth/callback/google`, plus the production one later.
3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Both only request basic profile and email access.

## Deploying

See [docs/deploy.md](docs/deploy.md). In production the server checks its settings on startup and refuses to start if something unsafe is missing, such as secrets, an https URL or a sign-in method.

## How the games stay fair

Every game runs on the server; the browser only sends moves.

- **Puzzles:** each date's puzzle is picked with a server-only `PUZZLE_SECRET`, created on first request, then frozen in the `puzzle` table. Answers never reach the browser until a player finishes.
- **One attempt per day:** each player gets one row in the `play` table per date. Progress, timers and scores are computed on the server from server time.
- **Moves:** each move is validated by the game (shape, legality, limits) and written with an optimistic version check, so parallel or repeated requests can't apply twice.
- **Requests:** game APIs require a signed-in player with a finished profile, reject cross-site POSTs, and are rate-limited per player.
- **Content:** real puzzle content with answers goes in `content/private/` (gitignored). `content/examples/` is public sample content for development only.
- **Review flags:** plays finished implausibly fast are flagged and left off leaderboards.

To test another weekday's game locally, set `WATTLE_DEV_DATE=YYYY-MM-DD` in `.env.local`. The play page also has a dev-only "reset my play" button.

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: production build
- `npm test`: run the test suite
- `npm run db:generate`: create a migration after changing `src/db/schema.ts`
- `npm run db:migrate:local`: apply migrations to the local database (`npm run dev` does this for you)
- `npm run db:migrate`: apply migrations to `DATABASE_URL` (Supabase)
- `npm run db:server`: run only the local database server, e.g. for `npm run db:studio`
- `npm run db:studio`: browse the database
