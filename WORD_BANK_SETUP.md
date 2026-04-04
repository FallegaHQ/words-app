# Word Bank & Dictionary Setup

The game loads two JSON files from `public/` at runtime — they are **not** bundled into the JavaScript, so the app stays fast to load regardless of file size.

## Files needed in `public/`

| File | Format | Purpose |
|------|--------|---------|
| `public/wordbank.json` | `["word1", "word2", …]` | List of words used for game generation (loaded on game start) |
| `public/dictionary.json` | `{ "word": "definition", … }` | Full dictionary (lazy-loaded only when a badge is clicked) |

## Generating `wordbank.json` from your dictionary

Open **`dictionary-extractor.html`** in any browser (no server needed — it runs fully client-side):

1. Drop your `dictionary.json` onto the page.
2. Adjust the word-length filter if desired (default: 4–7 letters).
3. Click **Extract & Download wordbank.json**.
4. Copy the downloaded file to `public/wordbank.json`.

## How lazy loading works

- **`wordbank.json`** is fetched once when you click *New Ticket*. It is cached in memory for all subsequent games in the same session.
- **`dictionary.json`** is fetched the **first time** a word badge is clicked. Until it finishes downloading a spinner is shown. After that it is cached — all subsequent badge clicks are instant.
- The game also starts a **background prefetch** of the dictionary right after a ticket is generated, so by the time you click a badge it is likely already loaded.

## Clicking word badges

Every word badge in the game is now clickable. Tap any badge to see its dictionary definition in a modal. Press **Escape** or click outside the modal to close it.
