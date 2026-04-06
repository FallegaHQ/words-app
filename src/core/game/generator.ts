// ── Game generation ───────────────────────────────────────────────────────────
// Top-level orchestration: runs the crossword-building loop, populates
// wild cells, deals hand tiles, and assembles the final GameState.

import { GRID_CONFIGS, MAX_GEN_ATTEMPTS, ALPHABET } from '../../constants';
import type { GridSizeKey, DifficultyKey } from '../../constants';
import type { Cell, Word, GameState } from '../../types';
import { randInt, shuffle } from './utils';
import { riggedCandidates, riggedHand } from './difficulty';
import { makeGrid, tryPlaceOneWord, placeWord, placeMultipliers } from './grid';

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffKeyFromValue(difficulty: number): DifficultyKey {
  return difficulty <= 0.3 ? 'easy' : difficulty <= 0.65 ? 'medium' : 'hard';
}

/**
 * Build the Lucky Draw pool: grid letters the player doesn't already hold.
 * Hard mode disables Lucky Draw entirely.
 * Easy mode removes 1 option; Medium removes 2 — keeping some uncertainty.
 */
function buildLuckyDrawPool(
  grid: Cell[][], handLetters: string[], bonusLetters: string[],
  difficultyKey: DifficultyKey
): string[] {
  if (difficultyKey === 'hard') return [];

  const gridLetters = new Set<string>();
  for (const row of grid)
    for (const cell of row)
      if (cell.wordIds.length > 0 && !cell.isWild)
        gridLetters.add(cell.letter);

  const playerLetters = new Set([...handLetters, ...bonusLetters]);
  const pool = [...gridLetters].filter(l => !playerLetters.has(l));

  const removeCount = difficultyKey === 'easy' ? 1 : 2;
  return shuffle(pool).slice(removeCount);
}

// ── Grid generation loop ──────────────────────────────────────────────────────

/**
 * One attempt at filling a grid with `targetWords` crossword-style words.
 * Returns null if placement fails (caller retries with new candidates).
 */
function tryGenerateGrid(
  candidates: string[], size: number, targetWords: number
): { grid: Cell[][]; words: Word[] } | null {
  const grid  = makeGrid(size);
  const words: Word[] = [];

  // Seed the grid with the first word, centred horizontally
  const first = candidates[0];
  placeWord(grid, words, first, Math.floor(size / 2), Math.floor((size - first.length) / 2), true, 0);

  let id = 1;
  for (let i = 1; i < candidates.length && words.length < targetWords; i++) {
    if (tryPlaceOneWord(grid, words, candidates[i], id)) id++;
  }

  return words.length >= targetWords ? { grid, words } : null;
}

// ── Game assembly ─────────────────────────────────────────────────────────────

/**
 * Takes a successfully-placed grid and completes the game object:
 *   1. Fill empty cells with random filler letters
 *   2. Assign wild (⭐) cells — one per word, at single-membership cells
 *   3. Place multipliers (2× / 3×)
 *   4. Deal rigged hand + bonus tiles
 *   5. Generate Lucky Draw pool
 *   6. Return the initial GameState
 */
function assembleGame(
  result:      { grid: Cell[][]; words: Word[] },
  difficulty:  number,
  handSize:    number,
  bonusSize:   number,
  wildCount:   number,
  doubleCount: number,
  tripleCount: number,
): GameState {
  const { grid, words } = result;
  const N = grid.length;
  const difficultyKey = diffKeyFromValue(difficulty);

  // 1. Fill filler cells
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (!grid[r][c].letter) grid[r][c].letter = ALPHABET[randInt(26)];

  // 2. Place wild cells (prefer cells that belong to exactly one word)
  const singles: [number, number][] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (grid[r][c].wordIds.length === 1) singles.push([r, c]);

  const wordsWithWild = new Set<number>();
  shuffle(singles)
    .filter(([r, c]) => {
      const wid = grid[r][c].wordIds[0];
      if (wordsWithWild.has(wid)) return false;
      wordsWithWild.add(wid);
      return true;
    })
    .slice(0, wildCount)
    .forEach(([r, c]) => { grid[r][c].isWild = true; });

  // 3. Multipliers
  placeMultipliers(grid, doubleCount, tripleCount);

  // 4. Hand tiles
  const { hand: handLetters, bonus: bonusLetters } = riggedHand(grid, difficulty, handSize, bonusSize);

  // 5. Lucky draw pool
  const luckyDrawPool = buildLuckyDrawPool(grid, handLetters, bonusLetters, difficultyKey);

  // 6. Assemble initial state — no cells scratched, no fog revealed
  const finalWords = words.map(w => ({
    ...w,
    complete: w.cells.every(([r, c]) => grid[r][c].scratched), // always false initially
  }));

  return {
    grid,
    words: finalWords,
    hand:  handLetters.map(l => ({ letter: l, revealed: false })),
    bonus: bonusLetters.map(l => ({ letter: l, revealed: false })),
    revealedLetters:     new Set(),
    animatedCells:       new Set(),
    newlyAvailableCells: new Set(),
    fogRevealed:         new Set(),
    luckyDrawUsed:       false,
    luckyDrawPool,
    initialHandLetters:  [...handLetters, ...bonusLetters],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

type ProgressCallback = (attempt: number, max: number, done: boolean) => void;

/**
 * Async wrapper around the generation loop.
 * Yields to the event loop between attempts so the loading UI stays responsive.
 * Throws if no valid layout is found within MAX_GEN_ATTEMPTS.
 */
export async function generateGameAsync(
  wordBank:    string[],
  onProgress:  ProgressCallback,
  difficulty:  number,
  gridSizeKey: GridSizeKey,
): Promise<GameState> {
  const {
    size, targetWords, handSize, bonusSize,
    wildCount, minWordLen, maxWordLen,
    doubleCount, tripleCount,
  } = GRID_CONFIGS[gridSizeKey];

  const validWords = wordBank.filter(w => w.length >= minWordLen && w.length <= maxWordLen);
  let result: { grid: Cell[][]; words: Word[] } | null = null;

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    onProgress(attempt + 1, MAX_GEN_ATTEMPTS, false);
    await new Promise<void>(r => setTimeout(r, 0)); // yield to UI
    result = tryGenerateGrid(riggedCandidates(validWords, difficulty), size, targetWords);
    if (result) break;
  }

  if (!result) throw new Error('Could not generate grid after max attempts');

  onProgress(MAX_GEN_ATTEMPTS, MAX_GEN_ATTEMPTS, true);
  return assembleGame(result, difficulty, handSize, bonusSize, wildCount, doubleCount, tripleCount);
}
