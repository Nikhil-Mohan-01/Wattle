# Wattle

Daily games for Waterloo students, with a campus-wide leaderboard. One game each weekday:

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
- Drizzle ORM on libSQL (a local SQLite file in dev, Turso or another libSQL host in production)

## Running locally

```bash
npm install
cp .env.example .env.local
npm run db:push
npm run dev
```

Then open http://localhost:3000.

## Sign-in

Only Waterloo accounts can sign in. There are two methods, and both are enforced on the server:

- **Microsoft (Option A):** "Continue with Waterloo". Pinned to Waterloo's Microsoft Entra tenant, so personal and other-school Microsoft accounts are rejected. Shown only when `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` are set.
- **Email link (Option B):** a one-time link sent to an `@uwaterloo.ca` address. Addresses with `+` are rejected. Turn it off with `AUTH_EMAIL_LINK_ENABLED=false`. Without `SMTP_URL`, links are printed to the dev server console.

After the first sign-in, players pick a leaderboard name and their faculty. The faculty can't be changed later.

### Setting up Microsoft sign-in

1. Sign in to the [Azure portal](https://portal.azure.com) with a personal Microsoft account. Open **Microsoft Entra ID → App registrations → New registration**.
2. Name: `Wattle`. Supported account types: **Accounts in any organizational directory (multitenant)**.
3. Redirect URI: platform **Web**, value `http://localhost:3000/api/auth/callback/microsoft`. Add the production URL later.
4. Copy the **Application (client) ID** into `MICROSOFT_CLIENT_ID`.
5. Under **Certificates & secrets → New client secret**, copy the secret **Value** into `MICROSOFT_CLIENT_SECRET`.
6. Leave `MICROSOFT_TENANT_ID` as Waterloo's tenant ID from `.env.example`.

The app only asks for `openid profile email`. If Waterloo blocks students from approving outside apps, Microsoft shows an "admin approval required" screen. In that case, the email link is the fallback.

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
- `npm run db:push`: sync the schema to the local database
- `npm run db:generate`: create a migration after changing `src/db/schema.ts`
- `npm run db:migrate`: apply migrations (production)
- `npm run db:studio`: browse the database
