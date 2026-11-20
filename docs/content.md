# Writing puzzle content

Quads and Deep Cut need hand-written puzzles. Put the real files in `content/private/` (gitignored), so the answers never reach GitHub. `content/examples/` holds public samples in the same format.

Check your files before deploying:

```bash
npm run content:check
```

It validates the format, says how many weeks of content you have before repeats, and fails if any puzzle was copied from the public examples.

Each game picks content that hasn't been used recently; once everything has been played, the oldest content comes back first. Each day's puzzle is saved the first time it's requested, so editing a file never changes a past or in-progress day.

## Quads: `content/private/quads.json`

One puzzle per Wednesday. An array of:

```json
{
  "id": "q101",
  "groups": [
    { "category": "Shades of blue", "difficulty": 1, "words": ["NAVY", "TEAL", "COBALT", "AZURE"] },
    { "category": "Chess pieces", "difficulty": 2, "words": ["KING", "BISHOP", "ROOK", "KNIGHT"] },
    { "category": "…", "difficulty": 3, "words": ["…", "…", "…", "…"] },
    { "category": "…", "difficulty": 4, "words": ["…", "…", "…", "…"] }
  ]
}
```

- `id` must be unique and never reused, since past days refer to it.
- Exactly 4 groups, with difficulties 1 (easy) to 4 (devious), each used once.
- Exactly 4 words per group. All 16 words must differ (ignoring case), with at most 40 characters each and no leading or trailing spaces.
- Good puzzles have red herrings: a word that seems to fit two groups but only works in one.

## Deep Cut: `content/private/deepcut.json`

Seven prompts per Monday. An array of:

```json
{
  "id": "planets",
  "prompt": "Name a planet in our solar system",
  "answers": [
    { "text": "Earth", "tier": 1 },
    { "text": "Mercury", "tier": 3, "aliases": ["planet mercury"] }
  ]
}
```

- `tier` is how rare an answer is: 1 = very common (10 pts), 2 = 25, 3 = 50, 4 = 75, 5 = very rare (100).
- `aliases` are other accepted spellings. Matching already ignores case, accents, punctuation and a leading "the", and allows small typos.
- List as many correct answers as you can. A correct answer missing from the list is marked wrong, which frustrates players.
- Prompt `id`s must be unique and stable.

Every answer and the per-prompt timing are stored, so rarity can later be recalculated from what Waterloo students actually answered.
