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

// ── Dictionary (fetched lazily on first badge click) ─────────────────────────
let dictionaryCache: Record<string, string> | null = null;
let dictionaryLoading: Promise<Record<string, string>> | null = null;

async function getDictionary(): Promise<Record<string, string>> {
  if (dictionaryCache) return dictionaryCache;
  if (dictionaryLoading) return dictionaryLoading;
  dictionaryLoading = fetch('/dictionary.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load dictionary: ${res.status}`);
      return res.json() as Promise<Record<string, string>>;
    })
    .then(dict => {
      dictionaryCache = dict;
      dictionaryLoading = null;
      return dict;
    })
    .catch(err => {
      dictionaryLoading = null; // allow retry
      throw err;
    });
  return dictionaryLoading;
}

// Kick off a background prefetch of the dictionary after the game is ready,
// so it is likely already cached when the player first clicks a badge.
function prefetchDictionary(): void {
  getDictionary().catch(() => { /* silent — will retry on badge click */ });
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
  // Show modal immediately with a loading spinner
  showDefinitionModal(word, null);

  try {
    const dict = await getDictionary();
    // Dictionary keys may be lowercase or original case — try both
    const def = dict[word.toLowerCase()] ?? dict[word] ?? null;
    showDefinitionModal(word, def ?? '(No definition found)');
  } catch {
    showDefinitionModal(
      word,
      '⚠️ Could not load dictionary.\nMake sure dictionary.json is placed in the public/ folder.'
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
      new Promise<void>(resolve => setTimeout(resolve, 2000)), // 2 s minimum
    ]);
  } catch {
    failed = true;
  }

  if (failed || !nextState) {
    renderError(() => startNewGame());
  } else {
    update(nextState!);
    prefetchDictionary(); // start loading dictionary in the background
  }
}

startNewGame();