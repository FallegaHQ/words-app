import { GRID_CONFIGS, MAX_GEN_ATTEMPTS, ALPHABET, LETTER_SCORES } from './constants';
import type { GridSizeKey, DifficultyKey } from './constants';
import type { Cell, Word, GameState } from './types';

// ── Utilities ─────────────────────────────────────────────────────────────────

export const randInt = (n: number): number => Math.floor(Math.random() * n);

export function shuffle<T>(arr: T[]): T[] {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ── Rigging helpers ───────────────────────────────────────────────────────────

const FREQ_RANK: Record<string, number> = Object.fromEntries(
  'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('').map((l, i) => [l, i])
);

function wordDifficulty(word: string): number {
  return word.split('').reduce((s, l) => s + (FREQ_RANK[l] ?? 13), 0) / word.length;
}

function riggedCandidates(words: string[], difficulty: number): string[] {
  const shuffled = shuffle(words);
  const scored = shuffled.map(w => ({
    word: w,
    score: wordDifficulty(w) * difficulty + Math.random() * (1 - difficulty) * 26,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.word);
}

function weightedSample(pool: string[], weights: number[], n: number): string[] {
  const p = [...pool], w = [...weights], result: string[] = [];
  for (let i = 0; i < n; i++) {
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, idx = 0;
    while (idx < p.length - 1 && r > w[idx]) r -= w[idx++];
    result.push(p[idx]); p.splice(idx, 1); w.splice(idx, 1);
  }
  return result;
}

function riggedHand(
  grid: Cell[][], difficulty: number, handSize: number, bonusSize: number
): { hand: string[]; bonus: string[] } {
  const coverage: Record<string, number> = Object.fromEntries(
    ALPHABET.split('').map(l => [l, 0])
  );
  for (const row of grid)
    for (const cell of row)
      if (cell.wordIds.length > 0 && !cell.isWild)
        coverage[cell.letter]++;

  const letters = ALPHABET.split('');
  const weights = letters.map(l => 1 / Math.pow(coverage[l] + 1, difficulty));
  const all = weightedSample(letters, weights, handSize + bonusSize);
  return { hand: all.slice(0, handSize), bonus: all.slice(handSize) };
}

// ── Lucky draw pool generation ────────────────────────────────────────────────

function generateLuckyDrawPool(
  grid: Cell[][], handLetters: string[], bonusLetters: string[], difficultyKey: DifficultyKey
): string[] {
  if (difficultyKey === 'hard') return [];

  // All unique letters on the grid (word cells, non-wild)
  const gridLetters = new Set<string>();
  const N = grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = grid[r][c];
      if (cell.wordIds.length > 0 && !cell.isWild)
        gridLetters.add(cell.letter);
    }

  // Letters not in player's initial hand/bonus
  const playerLetters = new Set([...handLetters, ...bonusLetters]);
  const pool = [...gridLetters].filter(l => !playerLetters.has(l));

  // Randomly remove 1 (easy) or 2 (medium) to introduce uncertainty
  const shuffled = shuffle(pool);
  const removeCount = difficultyKey === 'easy' ? 1 : 2;
  return shuffled.slice(removeCount);
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

function makeGrid(size: number): Cell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ letter: '', wordIds: [], isWild: false, scratched: false }))
  );
}

function canPlace(
  grid: Cell[][], words: Word[], word: string, sr: number, sc: number, horiz: boolean
): boolean {
  const N = grid.length, len = word.length;
  const er = horiz ? sr : sr + len - 1, ec = horiz ? sc + len - 1 : sc;
  if (sr < 0 || er >= N || sc < 0 || ec >= N) return false;
  if (horiz) {
    if (sc > 0 && grid[sr][sc - 1].letter)     return false;
    if (ec < N - 1 && grid[sr][ec + 1].letter) return false;
  } else {
    if (sr > 0 && grid[sr - 1][sc].letter)     return false;
    if (er < N - 1 && grid[er + 1][sc].letter) return false;
  }
  let hit = 0;
  for (let i = 0; i < len; i++) {
    const r = horiz ? sr : sr + i, c = horiz ? sc + i : sc;
    if (grid[r][c].letter) {
      if (grid[r][c].letter !== word[i]) return false;
      if (grid[r][c].wordIds.some(id => words[id]?.horiz === horiz)) return false;
      hit++;
    } else {
      if (horiz) {
        if ((r > 0 && grid[r-1][c].letter) || (r < N-1 && grid[r+1][c].letter)) return false;
      } else {
        if ((c > 0 && grid[r][c-1].letter) || (c < N-1 && grid[r][c+1].letter)) return false;
      }
    }
  }
  return hit > 0;
}

function placeWord(
  grid: Cell[][], words: Word[], word: string, sr: number, sc: number, horiz: boolean, id: number
): void {
  const cells: [number, number][] = [];
  for (let i = 0; i < word.length; i++) {
    const r = horiz ? sr : sr + i, c = horiz ? sc + i : sc;
    grid[r][c].letter = word[i];
    grid[r][c].wordIds.push(id);
    cells.push([r, c]);
  }
  words.push({ id, text: word, cells, horiz, complete: false });
}

function tryPlaceOneWord(grid: Cell[][], words: Word[], word: string, id: number): boolean {
  const opts: { sr: number; sc: number; horiz: boolean }[] = [];
  for (const pw of words) {
    for (let pi = 0; pi < pw.text.length; pi++) {
      for (let wi = 0; wi < word.length; wi++) {
        if (pw.text[pi] !== word[wi]) continue;
        const [pr, pc] = pw.cells[pi];
        if (pw.horiz) {
          const sr = pr - wi, sc = pc;
          if (canPlace(grid, words, word, sr, sc, false)) opts.push({ sr, sc, horiz: false });
        } else {
          const sr = pr, sc = pc - wi;
          if (canPlace(grid, words, word, sr, sc, true)) opts.push({ sr, sc, horiz: true });
        }
      }
    }
  }
  if (!opts.length) return false;
  const o = opts[randInt(opts.length)];
  placeWord(grid, words, word, o.sr, o.sc, o.horiz, id);
  return true;
}

// ── Multiplier placement ──────────────────────────────────────────────────────

function placeMultipliers(
  grid: Cell[][], doubleCount: number, tripleCount: number
): void {
  const candidates: { r: number; c: number; primaryWordId: number }[] = [];
  const N = grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = grid[r][c];
      if (cell.wordIds.length > 0 && !cell.isWild)
        candidates.push({ r, c, primaryWordId: cell.wordIds[0] });
    }

  const shuffled = shuffle(candidates);
  const usedWords = new Set<number>();
  let placed3 = 0, placed2 = 0;
  for (const { r, c, primaryWordId } of shuffled) {
    if (usedWords.has(primaryWordId)) continue;
    if (placed3 < tripleCount) {
      grid[r][c].multiplier = 3;
      usedWords.add(primaryWordId);
      placed3++;
    } else if (placed2 < doubleCount) {
      grid[r][c].multiplier = 2;
      usedWords.add(primaryWordId);
      placed2++;
    }
    if (placed3 >= tripleCount && placed2 >= doubleCount) break;
  }
}

// ── Score computation ─────────────────────────────────────────────────────────

export function computeWordScore(word: Word, grid: Cell[][]): number {
  let letterSum = 0;
  let wordMultiplier = 1;
  for (const [r, c] of word.cells) {
    const cell = grid[r][c];
    if (!cell.scratched) continue;
    letterSum += cell.isWild ? 1 : (LETTER_SCORES[cell.letter] ?? 1);
    if (cell.multiplier) wordMultiplier = Math.max(wordMultiplier, cell.multiplier);
  }
  return letterSum * wordMultiplier;
}

export function computeScore(state: GameState): number {
  return state.words
    .filter(w => w.complete)
    .reduce((sum, w) => sum + computeWordScore(w, state.grid), 0);
}

// ── Fog helpers ───────────────────────────────────────────────────────────────

function addAdjacentToFog(fog: Set<string>, grid: Cell[][], r: number, c: number): void {
  const N = grid.length;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]] as const;
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
      const neighbor = grid[nr][nc];
      if (neighbor.wordIds.length > 0)
        fog.add(`${nr},${nc}`);
    }
  }
}

function revealAllFog(fog: Set<string>, grid: Cell[][]): void {
  const N = grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      fog.add(`${r},${c}`);
}

// ── Grid generation ───────────────────────────────────────────────────────────

function tryGenerateGrid(
  candidates: string[], size: number, targetWords: number
): { grid: Cell[][]; words: Word[] } | null {
  const grid = makeGrid(size);
  const words: Word[] = [];
  const first = candidates[0];
  placeWord(grid, words, first, Math.floor(size / 2), Math.floor((size - first.length) / 2), true, 0);
  let id = 1;
  for (let i = 1; i < candidates.length && words.length < targetWords; i++) {
    if (tryPlaceOneWord(grid, words, candidates[i], id)) id++;
  }
  return words.length >= targetWords ? { grid, words } : null;
}

function diffKeyFromValue(difficulty: number): DifficultyKey {
  return difficulty <= 0.3 ? 'easy' : difficulty <= 0.65 ? 'medium' : 'hard';
}

function finishGame(
  result: { grid: Cell[][]; words: Word[] },
  difficulty: number,
  handSize: number, bonusSize: number, wildCount: number,
  doubleCount: number, tripleCount: number
): GameState {
  const { grid, words } = result;
  const N = grid.length;
  const difficultyKey = diffKeyFromValue(difficulty);

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (!grid[r][c].letter) grid[r][c].letter = ALPHABET[randInt(26)];

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

  const finalWords = words.map(w => ({
    ...w,
    complete: w.cells.every(([r, c]) => grid[r][c].scratched),
  }));

  placeMultipliers(grid, doubleCount, tripleCount);

  const { hand: handLetters, bonus: bonusLetters } = riggedHand(grid, difficulty, handSize, bonusSize);

  // Lucky draw pool
  const luckyDrawPool = generateLuckyDrawPool(grid, handLetters, bonusLetters, difficultyKey);

  // Fog: start with wild cells always visible (special-cased in render),
  // but cells adjacent to wild cells are NOT initially revealed — player must
  // scratch wild cells or reveal matching hand tiles to explore.
  const fogRevealed = new Set<string>();

  return {
    grid,
    words: finalWords,
    hand:  handLetters.map(l => ({ letter: l, revealed: false })),
    bonus: bonusLetters.map(l => ({ letter: l, revealed: false })),
    revealedLetters:     new Set(),
    animatedCells:       new Set(),
    newlyAvailableCells: new Set(),
    fogRevealed,
    luckyDrawUsed:       false,
    luckyDrawPool,
    initialHandLetters:  [...handLetters, ...bonusLetters],
  };
}

type ProgressCallback = (attempt: number, max: number, done: boolean) => void;

export async function generateGameAsync(
  wordBank: string[],
  onProgress: ProgressCallback,
  difficulty: number,
  gridSizeKey: GridSizeKey
): Promise<GameState> {
  const { size, targetWords, handSize, bonusSize, wildCount, minWordLen, maxWordLen, doubleCount, tripleCount } = GRID_CONFIGS[gridSizeKey];
  const validWords = wordBank.filter(w => w.length >= minWordLen && w.length <= maxWordLen);
  let result: { grid: Cell[][]; words: Word[] } | null = null;

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    onProgress(attempt + 1, MAX_GEN_ATTEMPTS, false);
    await new Promise<void>(r => setTimeout(r, 0));
    result = tryGenerateGrid(riggedCandidates(validWords, difficulty), size, targetWords);
    if (result) break;
  }
  if (!result) throw new Error('Could not generate grid after max attempts');
  onProgress(MAX_GEN_ATTEMPTS, MAX_GEN_ATTEMPTS, true);
  return finishGame(result, difficulty, handSize, bonusSize, wildCount, doubleCount, tripleCount);
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function revealTile(state: GameState, idx: number, isBonus: boolean): GameState {
  const hand  = state.hand.map(t => ({ ...t }));
  const bonus = state.bonus.map(t => ({ ...t }));
  const target = isBonus ? bonus : hand;
  if (target[idx].revealed) return state;
  target[idx].revealed = true;

  const newLetter = target[idx].letter;
  const revealedLetters = new Set([...state.revealedLetters, newLetter]);

  const N = state.grid.length;
  const justAvailable = new Set<string>();
  const newFog = new Set([...state.fogRevealed]);

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = state.grid[r][c];
      if (cell.letter === newLetter && cell.wordIds.length > 0 && !cell.isWild) {
        // Fog: letter revealed → matching cells become visible
        newFog.add(`${r},${c}`);
        if (!cell.scratched) justAvailable.add(`${r},${c}`);
      }
    }

  return {
    ...state, hand, bonus, revealedLetters,
    fogRevealed: newFog,
    animatedCells: new Set(),
    newlyAvailableCells: new Set([...state.newlyAvailableCells, ...justAvailable]),
  };
}

export function scratchCell(state: GameState, r: number, c: number): GameState {
  const cell = state.grid[r][c];
  if (cell.scratched || cell.wordIds.length === 0) return state;
  if (!cell.isWild && !state.revealedLetters.has(cell.letter)) return state;

  const grid = state.grid.map((row, ri) =>
    row.map((cl, ci) => ri === r && ci === c ? { ...cl, scratched: true } : cl)
  );
  const words = state.words.map(w => ({
    ...w, complete: w.cells.every(([wr, wc]) => grid[wr][wc].scratched),
  }));

  // Fog: scratching a cell reveals adjacent cells
  const newFog = new Set([...state.fogRevealed]);
  addAdjacentToFog(newFog, grid, r, c);

  // If all scratchable cells are now scratched, reveal entire grid
  const allScratched = grid.flat().every(cl => cl.wordIds.length === 0 || cl.scratched);
  if (allScratched) revealAllFog(newFog, grid);

  return {
    ...state, grid, words,
    fogRevealed: newFog,
    animatedCells: new Set([`${r},${c}`]),
    newlyAvailableCells: new Set(),
  };
}

export function useLuckyDrawTile(state: GameState, letter: string): GameState {
  if (state.luckyDrawUsed) return state;

  const N = state.grid.length;
  const revealedLetters = new Set([...state.revealedLetters, letter]);
  const newFog = new Set([...state.fogRevealed]);
  const justAvailable = new Set<string>();

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = state.grid[r][c];
      if (cell.letter === letter && cell.wordIds.length > 0 && !cell.isWild) {
        newFog.add(`${r},${c}`);
        if (!cell.scratched) justAvailable.add(`${r},${c}`);
      }
    }

  return {
    ...state,
    revealedLetters,
    fogRevealed: newFog,
    luckyDrawUsed: true,
    animatedCells: new Set(),
    newlyAvailableCells: new Set([...state.newlyAvailableCells, ...justAvailable]),
  };
}

export function tileIsUseful(letter: string, state: GameState): boolean {
  return state.words.some(w =>
    !w.complete &&
    w.cells.some(([r, c]) => state.grid[r][c].letter === letter && !state.grid[r][c].isWild)
  );
}
