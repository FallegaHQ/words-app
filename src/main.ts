import './style.css';
import { generateGameAsync, revealTile, scratchCell,
         useLuckyDrawTile, computeScore } from './gameLogic';
import { render, renderLoading, updateLoadingProgress, renderError,
         showDefinitionModal, hideDefinitionModal,
         showNewTicketModal, hideNewTicketModal,
         showHighScoreModal, showSummaryModal, hideSummaryModal,
         showAchievementsModal, showAchievementToast,
         type RenderCallbacks } from './render';
import { DIFFICULTY_PRESETS, GRID_CONFIGS, ACHIEVEMENTS } from './constants';
import type { DifficultyKey, GridSizeKey } from './constants';
import type { GameState, GameConfig, HighScore, AchievementRecord, Word } from './types';

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

// ── Achievements ──────────────────────────────────────────────────────────────

function loadAchievements(): Record<string, AchievementRecord> {
  try {
    const raw = localStorage.getItem('luckyLetters_achievements');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAchievements(data: Record<string, AchievementRecord>): void {
  try { localStorage.setItem('luckyLetters_achievements', JSON.stringify(data)); } catch {}
}

function getUnlockedIds(): Set<string> {
  const data = loadAchievements();
  return new Set(Object.entries(data).filter(([,v]) => v.unlocked).map(([k]) => k));
}

/** Check achievements against current state; return newly unlocked definitions. */
function checkAchievements(
  s: GameState, config: GameConfig, elapsedMs: number
): { id: string; icon: string; title: string }[] {
  const data = loadAchievements();
  const doneWords = s.words.filter(w => w.complete);
  const score     = computeScore(s);
  const totalWords = GRID_CONFIGS[config.gridSizeKey].targetWords;
  const wildcardCells = s.grid.flat().filter(c => c.isWild);
  const allWildScratched = wildcardCells.every(c => c.scratched);
  const allScratched = s.grid.flat().every(c => c.wordIds.length === 0 || c.scratched);

  // Words without any wildcard cells
  const wordsNoWild = doneWords.filter(w =>
    !w.cells.some(([r, c]) => s.grid[r][c].isWild)
  );

  const conditions: Record<string, boolean> = {
    'first_word':      doneWords.length >= 1,
    'find_5_words':    doneWords.length >= 5,
    'find_10_words':   doneWords.length >= 10,
    'perfect_card':    doneWords.length === totalWords,
    'hard_15_words':   config.difficultyKey === 'hard' && doneWords.length >= 15,
    '7_letter_word':   doneWords.some(w => w.text.length >= 7),
    '8_letter_word':   doneWords.some(w => w.text.length >= 8),
    '5_words_no_wild': wordsNoWild.length >= 5,
    'triple_word':     doneWords.some(w => w.cells.some(([r, c]) => s.grid[r][c].multiplier === 3)),
    'high_scorer':     score >= 500,
    'lucky_draw_win':  s.luckyDrawUsed && doneWords.length > 0,
    'speed_demon':     elapsedMs > 0 && elapsedMs < 180000 && doneWords.length >= 10,
    'fog_explorer':    allScratched,
    'wildcard_master': wildcardCells.length > 0 && allWildScratched,
  };

  const newlyUnlocked: { id: string; icon: string; title: string }[] = [];

  for (const ach of ACHIEVEMENTS) {
    const already = data[ach.id]?.unlocked ?? false;
    if (!already && conditions[ach.id]) {
      data[ach.id] = { unlocked: true, unlockedAt: new Date().toISOString() };
      newlyUnlocked.push({ id: ach.id, icon: ach.icon, title: ach.title });
    }
  }

  if (newlyUnlocked.length) saveAchievements(data);
  return newlyUnlocked;
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

function finaliseSession(): void {
  timerEnd ??= Date.now();
  if (state) saveScore(state, currentConfig);
}

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
  onLuckyDrawPick: (letter) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    update(useLuckyDrawTile(state, letter));
  },

  onNewGame: () => {
    // Pick settings first
    showNewTicketModal(currentConfig, (newConfig) => {
      hideNewTicketModal();

      // Always show summary of the current game before starting a new one
      if (state && !summaryShown) {
        summaryShown = true;
        finaliseSession();

        const snapState  = state;
        const snapConfig = currentConfig;

        showSummaryModal(snapState, snapConfig, getElapsedMs(), {
          onStart: () => {
            hideSummaryModal();
            currentConfig = newConfig;
            startNewGame();
          },
        });
      } else {
        currentConfig = newConfig;
        startNewGame();
      }
    });
  },

  onWordClick: (word, onDefinitionClosed) => handleWordClick(word, onDefinitionClosed),
  onShowHighScores: () => showHighScoreModal(getAllScores(), currentConfig),
  onShowAchievements: () => showAchievementsModal(getUnlockedIds()),
};

function update(next: GameState): void {
  state = next;
  render(state, callbacks, currentConfig);

  // Check achievements on every state change
  const newly = checkAchievements(state, currentConfig, getElapsedMs());
  // Show toasts sequentially with slight delay
  newly.forEach((ach, i) => {
    setTimeout(() => showAchievementToast(ach.icon, ach.title), i * 1200);
  });

  // Auto-trigger summary when all words are complete
  if (!summaryShown && state.words.length > 0 && state.words.every(w => w.complete)) {
    timerEnd = Date.now();
    setTimeout(showAutoSummary, 700);
  }
}

async function handleWordClick(word: string, onClosed: () => void): Promise<void> {
  showDefinitionModal(word, null, onClosed);
  try {
    const def = await getDefinition(word);
    showDefinitionModal(word, def ?? '(No definition found)', onClosed);
  } catch {
    showDefinitionModal(word, '⚠️ Could not load dictionary.\nMake sure the /dictionary/ folder is in public/.', onClosed);
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
