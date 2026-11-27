# Puzzle content

Every game makes a new puzzle each day by itself; nothing needs writing day to day.

- **Honk, Hot & Cold, Sharp:** picked from public word and country lists or generated from random numbers. The daily choice is decided by the secret `PUZZLE_SECRET`, so it can't be predicted.
- **Quads and Deep Cut:** built by algorithms from two **banks**. The banks contain the answers, so they're stored encrypted.

## Where the banks live

| Location | What | In git? |
| --- | --- | --- |
| `content/private/*.json` | Plain JSON you edit | No (gitignored) |
| `content/encrypted/*.json.enc` | AES-256-GCM encrypted copies | Yes |
| `content/examples/*.json` | Small public samples for development and tests | Yes |

The app reads `private/` first (local editing), then `encrypted/` (production, decrypted with `CONTENT_KEY`), then `examples/`.

### Editing a bank

1. If `content/private/` is empty (new machine), restore it: `npm run content:decrypt` (needs `CONTENT_KEY` in `.env.local`).
2. Edit `content/private/quads-bank.json` or `content/private/deepcut-bank.json`.
3. Check it: `npm run content:check`. This validates everything and prints how much variety you have.
4. Encrypt it: `npm run content:encrypt`, then commit `content/encrypted/`.

Create a new key with `npm run content:key`. Keep it somewhere safe, such as a password manager. Without it, the encrypted banks can't be read. If you ever change it, re-encrypt and update it on Vercel.

## Quads: `quads-bank.json`

Each day the generator:
- picks four categories, one per difficulty, all from different `family` values;
- takes 4 words from each;
- rejects the board if a word also appears in another chosen category;
- avoids categories used in the last 26 puzzles.

```json
{
  "categories": [
    { "id": "chess-pieces", "name": "Chess pieces", "difficulty": 1, "family": "games",
      "words": ["KING", "QUEEN", "BISHOP", "KNIGHT", "ROOK", "PAWN"] }
  ]
}
```

- `difficulty`: 1 easy, 2 medium, 3 tricky, 4 devious wordplay (e.g. "___ BALL", homophones).
- `family`: categories that could be confused with each other share a family, so they never appear on the same board.
- `words`: 6–20 per category, UPPERCASE letters, spaces and hyphens, at most 14 characters each.

## Deep Cut: `deepcut-bank.json`

Templates expand over datasets into hundreds of prompts. Each day, 7 prompts not used recently are picked.

```json
{
  "datasets": {
    "countries": [
      { "name": "Canada", "tier": 1, "attrs": { "continent": "North America" } }
    ]
  },
  "templates": [
    { "id": "country-continent", "dataset": "countries", "prompt": "Name a country in {value}", "attr": "continent" },
    { "id": "landlocked", "dataset": "countries", "prompt": "Name a landlocked country", "attr": "landlocked", "value": "yes" },
    { "id": "country-letter", "dataset": "countries", "prompt": "Name a country starting with {letter}", "letter": true },
    { "id": "all-countries", "dataset": "countries", "prompt": "Name a country" }
  ],
  "prompts": [
    { "id": "pizza-toppings", "prompt": "Name a pizza topping", "answers": [{ "text": "Pepperoni", "tier": 1 }] }
  ]
}
```

- A template with `attr` makes one prompt per value. Adding `value` makes a single prompt for that value. `letter: true` makes one prompt per first letter. A template with none of these uses the whole dataset.
- A generated prompt is used only if it has at least 6 answers across at least 3 tiers.
- `tier` (1 = very common, 5 = very rare) is a starting estimate.
- `aliases` are other accepted spellings. Matching already ignores case, accents and punctuation, and allows small typos.
- `prompts` holds hand-written prompts, for topics without a natural dataset.

### Rarity learns from students

Every correct answer is stored. Once a prompt has had at least 30 correct answers from finished, unflagged plays, the next time it's used each answer's tier comes from how often students actually gave it. An answer given by 20% or more of players is tier 1; one given by under 1%, or never, is tier 5. The bank's estimates only matter until then.
