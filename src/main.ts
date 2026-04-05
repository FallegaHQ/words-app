import './style.css';
import { generateGameAsync, revealTile, scratchCell,
         revealAllHand, revealAllBonus, scratchAllAvailable } from './gameLogic';
import { render, renderLoading, updateLoadingProgress, renderError,
         showDefinitionModal, hideDefinitionModal, type RenderCallbacks } from './render';
import type { GameState } from './types';

// ── Word bank (fetched once, used for game generation) ────────────────────────
let wordBankCache: string[] | null = null;

async function getWordBank(): Promise<string[]> {
  if (wordBankCache) return wordBankCache;
  const res = await fetch('/wordbank.json');
  if (!res.ok) throw new Error(`Failed to load word bank: ${res.status}`);
  const raw: string[] = await res.json();
  wordBankCache = raw.map(w => w.toUpperCase());
  return wordBankCache;
}

// ── Dictionary (chunked by first letter, loaded lazily) ───────────────────────
const dictChunkCache: Record<string, Record<string, string>> = {};
const dictChunkLoading: Record<string, Promise<Record<string, string>>> = {};

async function getDictChunk(letter: string): Promise<Record<string, string>> {
  const l = letter.toLowerCase();
  if (dictChunkCache[l]) return dictChunkCache[l];
  if (!dictChunkLoading[l]) {
    dictChunkLoading[l] = fetch(`/dictionary/${l}.json`)
      .then(res => {
        if (!res.ok) throw new Error(`Dict chunk '${l}' failed: ${res.status}`);
        return res.json() as Promise<Record<string, string>>;
      })
      .then(chunk => {
        dictChunkCache[l] = chunk;
        delete dictChunkLoading[l];
        return chunk;
      })
      .catch(err => {
        delete dictChunkLoading[l];
        throw err;
      });
  }
  return dictChunkLoading[l];
}

async function getDefinition(word: string): Promise<string | null> {
  const lower = word.toLowerCase();
  const chunk = await getDictChunk(lower[0]);
  return chunk[lower] ?? null;
}

// Prefetch the chunks for letters present in the current game board.
function prefetchDictChunks(words: string[]): void {
  const letters = new Set(words.map(w => w[0].toLowerCase()));
  for (const letter of letters) {
    getDictChunk(letter).catch(() => { /* silent — will retry on click */ });
  }
}

// ── Game state ────────────────────────────────────────────────────────────────
let state: GameState | null = null;

const callbacks: RenderCallbacks = {
  onRevealTile:      (i, isBonus) => state && update(revealTile(state, i, isBonus)),
  onScratchCell:     (r, c)       => state && update(scratchCell(state, r, c)),
  onRevealAllHand:   ()           => state && update(revealAllHand(state)),
  onRevealAllBonus:  ()           => state && update(revealAllBonus(state)),
  onScratchAllAvail: ()           => state && update(scratchAllAvailable(state)),
  onNewGame:         ()           => startNewGame(),
  onWordClick:       (word)       => handleWordClick(word),
};

function update(next: GameState): void {
  state = next;
  render(state, callbacks);
}

async function handleWordClick(word: string): Promise<void> {
  showDefinitionModal(word, null); // show spinner immediately

  try {
    const def = await getDefinition(word);
    showDefinitionModal(word, def ?? '(No definition found)');
  } catch {
    showDefinitionModal(
      word,
      '⚠️ Could not load dictionary.\nMake sure the /dictionary/ folder is in public/.'
    );
  }
}

async function startNewGame(): Promise<void> {
  hideDefinitionModal();
  renderLoading();

  let nextState: GameState | null = null;
  let failed = false;

  try {
    const wordBank = await getWordBank();

    await Promise.all([
      generateGameAsync(wordBank, (attempt, max, done) => {
        updateLoadingProgress(attempt, max, done);
      }).then(s => { nextState = s; }).catch(() => { failed = true; }),
      new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch {
    failed = true;
  }

  if (failed || !nextState) {
    renderError(() => startNewGame());
  } else {
    update(nextState!);
    // Prefetch only the letter chunks needed for this game's words
    if (nextState.words) {
      prefetchDictChunks(nextState.words.map(w => w.text ?? w));
    }
  }
}

startNewGame();