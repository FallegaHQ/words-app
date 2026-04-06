import './style.css';
import { generateGameAsync, revealTile, scratchCell,
         revealAllHand, revealAllBonus, scratchAllAvailable,
         computeScore } from './gameLogic';
import { render, renderLoading, updateLoadingProgress, renderError,
         showDefinitionModal, hideDefinitionModal,
         showNewTicketModal, hideNewTicketModal,
         showHighScoreModal, showSummaryModal, hideSummaryModal,
         type RenderCallbacks } from './render';
import { DIFFICULTY_PRESETS, GRID_CONFIGS } from './constants';
import type { DifficultyKey, GridSizeKey } from './constants';
import type { GameState, GameConfig, HighScore, Word } from './types';

// ── Word bank ─────────────────────────────────────────────────────────────────

let wordBankCache: string[] | null = null;
async function getWordBank(): Promise<string[]> {
  if (wordBankCache) return wordBankCache;
  const res = await fetch('/wordbank.json');
  if (!res.ok) throw new Error(`Failed to load word bank: ${res.status}`);
  const raw: string[] = await res.json();
  wordBankCache = raw.map(w => w.toUpperCase());
  return wordBankCache;
}

// ── Dictionary ────────────────────────────────────────────────────────────────

const dictChunkCache: Record<string, Record<string, string>> = {};
const dictChunkLoading: Record<string, Promise<Record<string, string>>> = {};

async function getDictChunk(letter: string): Promise<Record<string, string>> {
  const l = letter.toLowerCase();
  if (dictChunkCache[l]) return dictChunkCache[l];
  if (!dictChunkLoading[l]) {
    dictChunkLoading[l] = fetch(`/dictionary/${l}.json`)
      .then(res => { if (!res.ok) throw new Error(); return res.json() as Promise<Record<string, string>>; })
      .then(chunk => { dictChunkCache[l] = chunk; delete dictChunkLoading[l]; return chunk; })
      .catch(err  => { delete dictChunkLoading[l]; throw err; });
  }
  return dictChunkLoading[l];
}

async function getDefinition(word: string): Promise<string | null> {
  const lower = word.toLowerCase();
  const chunk = await getDictChunk(lower[0]);
  return chunk[lower] ?? null;
}

function prefetchDictChunks(words: string[]): void {
  const letters = new Set(words.map(w => w[0].toLowerCase()));
  for (const letter of letters) getDictChunk(letter).catch(() => {});
}

// ── High scores ───────────────────────────────────────────────────────────────

function hsKey(diffKey: DifficultyKey, sizeKey: GridSizeKey): string {
  return `luckyLetters_hs_${diffKey}_${sizeKey}`;
}

function getScoresFor(diffKey: DifficultyKey, sizeKey: GridSizeKey): HighScore[] {
  try {
    const raw = localStorage.getItem(hsKey(diffKey, sizeKey));
    return raw ? (JSON.parse(raw) as HighScore[]) : [];
  } catch { return []; }
}

function getAllScores(): Partial<Record<DifficultyKey, Partial<Record<GridSizeKey, HighScore[]>>>> {
  const diffKeys: DifficultyKey[] = ['easy', 'medium', 'hard'];
  const sizeKeys: GridSizeKey[]   = ['small', 'normal', 'large'];
  const result: Partial<Record<DifficultyKey, Partial<Record<GridSizeKey, HighScore[]>>>> = {};
  for (const d of diffKeys) {
    result[d] = {};
    for (const s of sizeKeys) result[d]![s] = getScoresFor(d, s);
  }
  return result;
}

function saveScore(state: GameState, config: GameConfig): void {
  const wordsComplete = state.words.filter(w => w.complete).length;
  if (wordsComplete === 0) return;
  const score  = computeScore(state);
  const scores = getScoresFor(config.difficultyKey, config.gridSizeKey);
  scores.push({
    words:         wordsComplete,
    total:         GRID_CONFIGS[config.gridSizeKey].targetWords,
    score,
    date:          new Date().toISOString(),
    difficultyKey: config.difficultyKey,
    gridSizeKey:   config.gridSizeKey,
  });
  scores.sort((a, b) => b.score - a.score || b.words - a.words);
  try {
    localStorage.setItem(hsKey(config.difficultyKey, config.gridSizeKey), JSON.stringify(scores.slice(0, 100)));
  } catch { /* storage full */ }
}

// ── App state ─────────────────────────────────────────────────────────────────

let state:         GameState | null = null;
let currentConfig: GameConfig = {
  difficulty:    DIFFICULTY_PRESETS.medium,
  difficultyKey: 'medium',
  gridSizeKey:   'normal',
};

// ── Session timer ─────────────────────────────────────────────────────────────

let timerStart:   number | null = null;
let timerEnd:     number | null = null;
let summaryShown: boolean       = false;

function getElapsedMs(): number {
  if (!timerStart) return 0;
  return (timerEnd ?? Date.now()) - timerStart;
}

function resetSessionState(): void {
  timerStart   = null;
  timerEnd     = null;
  summaryShown = false;
}

// ── Summary helpers ───────────────────────────────────────────────────────────

/** Snapshot the timer and persist the score. Idempotent — safe to call twice. */
function finaliseSession(): void {
  timerEnd ??= Date.now();
  if (state) saveScore(state, currentConfig);
}

/**
 * Auto-trigger path: summary pops up on its own after all words are done.
 * Buttons: "Play Again" (same config) and "Change Settings".
 */
function showAutoSummary(): void {
  if (!state || summaryShown) return;
  summaryShown = true;
  finaliseSession();

  const snapState  = state;
  const snapConfig = currentConfig;

  showSummaryModal(snapState, snapConfig, getElapsedMs(), {
    onPlayAgain: () => {
      hideSummaryModal();
      startNewGame();
    },
    onChangeSettings: () => {
      hideSummaryModal();
      showNewTicketModal(currentConfig, (newConfig) => {
        hideNewTicketModal();
        currentConfig = newConfig;
        startNewGame();
      });
    },
  });
}

// ── Render callbacks ──────────────────────────────────────────────────────────

const callbacks: RenderCallbacks = {
  onRevealTile: (i, isBonus) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    update(revealTile(state, i, isBonus));
  },
  onScratchCell: (r, c) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    update(scratchCell(state, r, c));
  },
  onRevealAllHand:   () => state && update(revealAllHand(state)),
  onRevealAllBonus:  () => state && update(revealAllBonus(state)),
  onScratchAllAvail: () => state && update(scratchAllAvailable(state)),

  onNewGame: () => {
    // Step 1: player picks their new settings first.
    showNewTicketModal(currentConfig, (newConfig) => {
      hideNewTicketModal();

      // Step 2: if there's a meaningful game to recap and the auto-summary
      // hasn't already shown it, show the summary of the OLD game now.
      // Every exit from this summary (button, Escape, backdrop) leads to
      // starting the new game — the player has already committed.
      if (state && computeScore(state) > 0 && !summaryShown) {
        summaryShown = true;
        finaliseSession();

        const snapState  = state;
        const snapConfig = currentConfig;  // config of the game being summarised

        showSummaryModal(snapState, snapConfig, getElapsedMs(), {
          onStart: () => {
            hideSummaryModal();
            currentConfig = newConfig;
            startNewGame();
          },
        });
      } else {
        // Nothing to recap — start straight away.
        currentConfig = newConfig;
        startNewGame();
      }
    });
  },

  onWordClick:      (word) => handleWordClick(word),
  onShowHighScores: () => showHighScoreModal(getAllScores(), currentConfig),
};

function update(next: GameState): void {
  state = next;
  render(state, callbacks, currentConfig);

  // Auto-trigger summary when all words are complete.
  if (!summaryShown && state.words.length > 0 && state.words.every(w => w.complete)) {
    timerEnd = Date.now();
    setTimeout(showAutoSummary, 700);
  }
}

async function handleWordClick(word: string): Promise<void> {
  showDefinitionModal(word, null);
  try {
    const def = await getDefinition(word);
    showDefinitionModal(word, def ?? '(No definition found)');
  } catch {
    showDefinitionModal(word, '⚠️ Could not load dictionary.\nMake sure the /dictionary/ folder is in public/.');
  }
}

async function startNewGame(): Promise<void> {
  hideDefinitionModal();
  resetSessionState();
  renderLoading();

  let nextState: GameState | null = null;
  let failed = false;

  try {
    const wordBank = await getWordBank();
    const cfg = currentConfig;
    await Promise.all([
      generateGameAsync(wordBank, (attempt, max, done) => {
        updateLoadingProgress(attempt, max, done);
      }, cfg.difficulty, cfg.gridSizeKey)
        .then((s: GameState) => { nextState = s; })
        .catch(() => { failed = true; }),
      new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch { failed = true; }

  if (failed || !nextState) { renderError(() => startNewGame()); return; }

  const resolvedState: GameState = nextState;
  update(resolvedState);
  prefetchDictChunks(resolvedState.words.map((w: Word) => w.text));
}

startNewGame();
