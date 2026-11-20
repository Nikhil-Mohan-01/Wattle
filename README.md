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

## Scripts

- `npm run dev`: start the dev server
- `npm run build`: production build
- `npm run db:push`: sync the schema to the database
- `npm run db:studio`: browse the database
