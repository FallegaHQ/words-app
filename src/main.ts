import './style.css';
import { generateGameAsync, revealTile, scratchCell,
         revealAllHand, revealAllBonus, scratchAllAvailable } from './gameLogic';
import { render, renderLoading, updateLoadingProgress, renderError,
         showDefinitionModal, hideDefinitionModal,
         showHighScoreModal, type RenderCallbacks } from './render';
import { DIFFICULTY_PRESETS } from './constants';
import type { GameState, Word, HighScore } from './types';

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

// ── Dictionary (chunked by first letter) ──────────────────────────────────────

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

// ── High score persistence ────────────────────────────────────────────────────

const HS_KEY = 'luckyLetters_scores';

function getHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(HS_KEY);
    return raw ? (JSON.parse(raw) as HighScore[]) : [];
  } catch { return []; }
}

function saveScore(wordsComplete: number): void {
  if (wordsComplete === 0) return;
  const scores = getHighScores();
  scores.push({ words: wordsComplete, date: new Date().toISOString() });
  scores.sort((a, b) => b.words - a.words);
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(scores.slice(0, 100)));
  } catch { /* storage full or blocked */ }
}

// ── App state ─────────────────────────────────────────────────────────────────

let state: GameState | null = null;
let currentDifficulty: number = DIFFICULTY_PRESETS.medium;

const callbacks: RenderCallbacks = {
  onRevealTile:       (i, isBonus) => state && update(revealTile(state, i, isBonus)),
  onScratchCell:      (r, c)       => state && update(scratchCell(state, r, c)),
  onRevealAllHand:    ()           => state && update(revealAllHand(state)),
  onRevealAllBonus:   ()           => state && update(revealAllBonus(state)),
  onScratchAllAvail:  ()           => state && update(scratchAllAvailable(state)),
  onNewGame: () => {
    if (state) saveScore(state.words.filter(w => w.complete).length);
    startNewGame();
  },
  onWordClick:          (word) => handleWordClick(word),
  onDifficultyChange:   (diff) => { currentDifficulty = diff; },
  onShowHighScores:     ()    => showHighScoreModal(getHighScores()),
};

function update(next: GameState): void {
  state = next;
  render(state, callbacks, currentDifficulty);
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
  renderLoading();

  let nextState: GameState | null = null;
  let failed = false;

  try {
    const wordBank = await getWordBank();
    const difficulty = currentDifficulty;

    await Promise.all([
      generateGameAsync(wordBank, (attempt, max, done) => {
        updateLoadingProgress(attempt, max, done);
      }, difficulty)
        .then((s: GameState) => { nextState = s; })
        .catch(() => { failed = true; }),
      new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch {
    failed = true;
  }

  if (failed || !nextState) {
    renderError(() => startNewGame());
    return;
  }

  const resolvedState: GameState = nextState;
  update(resolvedState);
  prefetchDictChunks(resolvedState.words.map((w: Word) => w.text));
}

startNewGame();
