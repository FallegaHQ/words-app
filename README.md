# Lucky Letters — Word Bank & Dictionary Setup

## File structure

```
public/
  wordbank.json      ← flat array of words used for game generation (small, fast)
  dictionary.json    ← { "word": "definition", … } used for badge definitions (lazy-loaded)
dictionary-extractor.html  ← browser tool to generate wordbank.json from dictionary.json
```

---

## Quick start

### 1. Provide your `dictionary.json`

Place your dictionary file at `public/dictionary.json`.

Expected format — a single JSON object where **keys are words** and **values are their definitions**:

```json
{
  "serendipity": "The occurrence of events by chance in a happy or beneficial way.",
  "ephemeral":   "Lasting for a very short time.",
  "…": "…"
}
```

### 2. Generate `wordbank.json` (word list for game generation)

The dictionary is 30 MB and is **only** lazy-loaded when a player clicks a badge.
For game generation you need a much smaller flat word list.

**Open `dictionary-extractor.html` in your browser** (no server needed — it runs entirely client-side):

1. Upload your `dictionary.json`
2. Set min/max word length (default: 4 – 8 letters)
3. Optionally cap the count (50 000 words is a sweet spot)
4. Click **Generate wordbank.json** — it downloads automatically
5. Move the downloaded file to `public/wordbank.json`

---

## How the loading works

| File              | When loaded                        | Method               |
|-------------------|------------------------------------|----------------------|
| `wordbank.json`   | At game start (before generation)  | `fetch()` — async    |
| `dictionary.json` | Background after game is shown;    | `fetch()` — async,   |
|                   | confirmed on first badge click     | cached in memory     |

Neither file is bundled into the JavaScript — the page shell loads instantly and both
files are streamed in the background, keeping the UI responsive at all times.

---

## Badge definitions

Click any word badge on the game board to see its definition in a pop-up modal.
The dictionary is fetched once and cached for the rest of the session.
