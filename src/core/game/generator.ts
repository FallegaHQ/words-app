// ── Game generation ───────────────────────────────────────────────────────────
// Grid + wilds + multipliers are driven only by the seed stream. Hand/bonus/lucky
// are assembled later via `assembleHandIntoState` (after tile drafting).

import { GRID_CONFIGS, MAX_GEN_ATTEMPTS, ALPHABET, DAILY_SEED_SUFFIX } from '../../constants';
import type { GridSizeKey, DifficultyKey } from '../../constants';
import type { Cell, Word, GameState, Tile } from '../../types';
import { randInt, shuffle, mulberry32, hashSeed, type RandomFn } from './utils';
import { riggedHand, shuffleWordBankForGrid } from './difficulty';
import { makeGrid, tryPlaceOneWord, placeWord, placeMultipliers } from './grid';

function diffKeyFromValue(difficulty: number): DifficultyKey {
  return difficulty <= 0.3 ? 'easy' : difficulty <= 0.65 ? 'medium' : 'hard';
}

function buildLuckyDrawPool(
  grid: Cell[][],
  handLetters: string[],
  bonusLetters: string[],
  difficultyKey: DifficultyKey,
  random: RandomFn
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
  return shuffle(pool, random).slice(removeCount);
}

function tryGenerateGrid(
  candidates: string[],
  size: number,
  targetWords: number,
  random: RandomFn
): { grid: Cell[][]; words: Word[] } | null {
  const grid = makeGrid(size);
  const words: Word[] = [];

  const first = candidates[0];
  placeWord(grid, words, first, Math.floor(size / 2), Math.floor((size - first.length) / 2), true, 0);

  let id = 1;
  for (let i = 1; i < candidates.length && words.length < targetWords; i++) {
    if (tryPlaceOneWord(grid, words, candidates[i], id, random)) id++;
  }

  return words.length >= targetWords ? { grid, words } : null;
}

/**
 * After a successful crossword layout: filler letters, wilds, multipliers.
 * Does not deal hand/bonus (those follow drafting).
 */
function assembleGridOnly(
  result: { grid: Cell[][]; words: Word[] },
  wildCount: number,
  doubleCount: number,
  tripleCount: number,
  random: RandomFn
): GameState {
  const { grid, words } = result;
  const N = grid.length;

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (!grid[r][c].letter) grid[r][c].letter = ALPHABET[randInt(26, random)];

  const singles: [number, number][] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (grid[r][c].wordIds.length === 1) singles.push([r, c]);

  const wordsWithWild = new Set<number>();
  shuffle(singles, random)
    .filter(([r, c]) => {
      const wid = grid[r][c].wordIds[0];
      if (wordsWithWild.has(wid)) return false;
      wordsWithWild.add(wid);
      return true;
    })
    .slice(0, wildCount)
    .forEach(([r, c]) => { grid[r][c].isWild = true; });

  placeMultipliers(grid, doubleCount, tripleCount, random);

  const finalWords = words.map(w => ({
    ...w,
    complete: w.cells.every(([r, c]) => grid[r][c].scratched),
  }));

  return {
    grid,
    words:               finalWords,
    hand:                [],
    bonus:               [],
    revealedLetters:     new Set(),
    animatedCells:       new Set(),
    newlyAvailableCells: new Set(),
    fogRevealed:         new Set(),
    luckyDrawUsed:       false,
    luckyDrawPool:       [],
    initialHandLetters:  [],
    draftedLetters:      [],
  };
}

/**
 * Deal hand/bonus/lucky draw using a **separate** RNG keyed by seed + drafted picks
 * so the same grid seed + same draft yields the same hand.
 */
export function assembleHandIntoState(
  base: GameState,
  difficulty: number,
  handSize: number,
  bonusSize: number,
  difficultyKey: DifficultyKey,
  draftedLetters: string[],
  seedStr: string
): GameState {
  const normDraft: string[] = [];
  const seen = new Set<string>();
  for (const raw of draftedLetters) {
    const L = raw.toUpperCase();
    if (!/[A-Z]/.test(L) || seen.has(L)) continue;
    seen.add(L);
    normDraft.push(L);
  }

  const handRng = mulberry32(hashSeed(`${seedStr}|hand|${normDraft.join('')}`));
  const { hand: handLetters, bonus: bonusLetters } = riggedHand(
    base.grid,
    difficulty,
    handSize,
    bonusSize,
    handRng,
    normDraft
  );

  const hand: Tile[] = handLetters.map((letter, i) => ({
    letter,
    revealed: i < normDraft.length,
  }));

  const bonus: Tile[] = bonusLetters.map(l => ({ letter: l, revealed: false }));

  const poolRng = mulberry32(hashSeed(`${seedStr}|lucky|${normDraft.join('')}`));
  const luckyDrawPool = buildLuckyDrawPool(
    base.grid,
    handLetters,
    bonusLetters,
    difficultyKey,
    poolRng
  );

  const revealedLetters = new Set(normDraft);
  const draftSet = new Set(normDraft);
  const N = base.grid.length;
  const newFog = new Set(base.fogRevealed);
  const justAvailable = new Set<string>();

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = base.grid[r][c];
      if (
        cell.letter &&
        draftSet.has(cell.letter) &&
        cell.wordIds.length > 0 &&
        !cell.isWild
      ) {
        newFog.add(`${r},${c}`);
        if (!cell.scratched) justAvailable.add(`${r},${c}`);
      }
    }

  return {
    ...base,
    hand,
    bonus,
    luckyDrawPool,
    initialHandLetters: [...handLetters, ...bonusLetters],
    draftedLetters: normDraft,
    revealedLetters,
    fogRevealed: newFog,
    newlyAvailableCells: new Set([...base.newlyAvailableCells, ...justAvailable]),
  };
}

type ProgressCallback = (attempt: number, max: number, done: boolean) => void;

/** Readable daily seed string (UTC date + app suffix). */
export function getDailySeedString(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '') + DAILY_SEED_SUFFIX;
}

/** Random shareable seed (4×4 alphanumeric groups). */
export function generateRandomSeedString(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => chars[Math.floor(Math.random() * chars.length)];
  const block = () => Array.from({ length: 4 }, pick).join('');
  return `${block()}-${block()}-${block()}-${block()}`;
}

/**
 * Builds grid-only state (empty hand). One PRNG stream from `hashSeed(seedStr)`
 * so retries and assembly are fully deterministic for a given seed.
 */
export async function generateGridOnlyAsync(
  wordBank: string[],
  onProgress: ProgressCallback,
  gridSizeKey: GridSizeKey,
  seedStr: string
): Promise<GameState> {
  const {
    size,
    targetWords,
    minWordLen,
    maxWordLen,
    wildCount,
    doubleCount,
    tripleCount,
  } = GRID_CONFIGS[gridSizeKey];

  const validWords = wordBank.filter(w => w.length >= minWordLen && w.length <= maxWordLen);
  let result: { grid: Cell[][]; words: Word[] } | null = null;

  const rng = mulberry32(hashSeed(seedStr) ^ 0x9e3779b9);

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    onProgress(attempt + 1, MAX_GEN_ATTEMPTS, false);
    await new Promise<void>(r => setTimeout(r, 0));

    const candidates = shuffleWordBankForGrid(validWords, rng);
    result = tryGenerateGrid(candidates, size, targetWords, rng);
    if (result) break;
  }

  if (!result) throw new Error('Could not generate grid after max attempts');

  onProgress(MAX_GEN_ATTEMPTS, MAX_GEN_ATTEMPTS, true);
  return assembleGridOnly(result, wildCount, doubleCount, tripleCount, rng);
}

/**
 * @deprecated Prefer `generateGridOnlyAsync` + draft + `assembleHandIntoState`.
 * Kept for callers that want a one-shot game without drafting.
 */
export async function generateGameAsync(
  wordBank: string[],
  onProgress: ProgressCallback,
  difficulty: number,
  gridSizeKey: GridSizeKey,
  seedStr: string = generateRandomSeedString()
): Promise<GameState> {
  const { handSize, bonusSize } = GRID_CONFIGS[gridSizeKey];
  const difficultyKey = diffKeyFromValue(difficulty);
  const grid = await generateGridOnlyAsync(wordBank, onProgress, gridSizeKey, seedStr);
  return assembleHandIntoState(
    grid,
    difficulty,
    handSize,
    bonusSize,
    difficultyKey,
    [],
    seedStr
  );
}
