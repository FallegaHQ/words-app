import { GRID_SIZE, TARGET_WORDS, HAND_SIZE, BONUS_SIZE, WILD_COUNT,
         MAX_GEN_ATTEMPTS, ALPHABET } from './constants';
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

/**
 * English letter frequency rank: index 0 = most common (E), 25 = rarest (Z).
 * A high rank means the letter appears rarely in typical text.
 */
const FREQ_RANK: Record<string, number> = Object.fromEntries(
  'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('').map((l, i) => [l, i])
);

/** Average rarity of a word's letters. Higher → rarer letters → harder to scratch. */
function wordDifficulty(word: string): number {
  return word.split('').reduce((s, l) => s + (FREQ_RANK[l] ?? 13), 0) / word.length;
}

/**
 * Returns candidates sorted so harder words (rare letters) tend to appear first.
 * At difficulty=0 the result is a plain shuffle; at 1 it's sorted hardest-first.
 */
function riggedCandidates(words: string[], difficulty: number): string[] {
  const shuffled = shuffle(words);
  const scored = shuffled.map(w => ({
    word: w,
    score: wordDifficulty(w) * difficulty + Math.random() * (1 - difficulty) * 26,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.word);
}

/**
 * Weighted sampling without replacement.
 */
function weightedSample(pool: string[], weights: number[], n: number): string[] {
  const p = [...pool];
  const w = [...weights];
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    while (idx < p.length - 1 && r > w[idx]) r -= w[idx++];
    result.push(p[idx]);
    p.splice(idx, 1);
    w.splice(idx, 1);
  }
  return result;
}

/**
 * Builds a rigged hand from the alphabet.
 * Letters that cover many word cells in the grid are given lower selection weight.
 * At difficulty=0 it's a plain shuffle; at 1 it's maximally unhelpful.
 */
function riggedHand(grid: Cell[][], difficulty: number): { hand: string[]; bonus: string[] } {
  const coverage: Record<string, number> = Object.fromEntries(
    ALPHABET.split('').map(l => [l, 0])
  );
  for (const row of grid)
    for (const cell of row)
      if (cell.wordIds.length > 0 && !cell.isWild)
        coverage[cell.letter]++;

  const letters = ALPHABET.split('');
  const weights = letters.map(l =>
    1 / Math.pow(coverage[l] + 1, difficulty)
  );

  const all = weightedSample(letters, weights, HAND_SIZE + BONUS_SIZE);
  return { hand: all.slice(0, HAND_SIZE), bonus: all.slice(HAND_SIZE) };
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

function makeGrid(): Cell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({
      letter: '', wordIds: [], isWild: false, scratched: false,
    }))
  );
}

function canPlace(
  grid: Cell[][], words: Word[], word: string, sr: number, sc: number, horiz: boolean
): boolean {
  const N   = GRID_SIZE;
  const len = word.length;
  const er  = horiz ? sr : sr + len - 1;
  const ec  = horiz ? sc + len - 1 : sc;
  if (sr < 0 || er >= N || sc < 0 || ec >= N) return false;
  if (horiz) {
    if (sc > 0 && grid[sr][sc - 1].letter)       return false;
    if (ec < N - 1 && grid[sr][ec + 1].letter)   return false;
  } else {
    if (sr > 0 && grid[sr - 1][sc].letter)       return false;
    if (er < N - 1 && grid[er + 1][sc].letter)   return false;
  }
  let hit = 0;
  for (let i = 0; i < len; i++) {
    const r = horiz ? sr : sr + i;
    const c = horiz ? sc + i : sc;
    if (grid[r][c].letter) {
      if (grid[r][c].letter !== word[i]) return false;
      const collinear = grid[r][c].wordIds.some(id => words[id]?.horiz === horiz);
      if (collinear) return false;
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
  grid: Cell[][], words: Word[],
  word: string, sr: number, sc: number, horiz: boolean, id: number
): void {
  const cells: [number, number][] = [];
  for (let i = 0; i < word.length; i++) {
    const r = horiz ? sr : sr + i;
    const c = horiz ? sc + i : sc;
    grid[r][c].letter = word[i];
    grid[r][c].wordIds.push(id);
    cells.push([r, c]);
  }
  words.push({ id, text: word, cells, horiz, complete: false });
}

function tryPlaceOneWord(
  grid: Cell[][], words: Word[], word: string, id: number
): boolean {
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

// ── Game generation ───────────────────────────────────────────────────────────

function tryGenerateGrid(candidates: string[]): { grid: Cell[][]; words: Word[] } | null {
  const N    = GRID_SIZE;
  const grid = makeGrid();
  const words: Word[] = [];

  const first = candidates[0];
  placeWord(grid, words, first, Math.floor(N / 2), Math.floor((N - first.length) / 2), true, 0);

  let id = 1;
  for (let i = 1; i < candidates.length && words.length < TARGET_WORDS; i++) {
    if (tryPlaceOneWord(grid, words, candidates[i], id)) id++;
  }

  return words.length >= TARGET_WORDS ? { grid, words } : null;
}

export function generateGame(wordBank: string[], difficulty: number): GameState {
  let result: { grid: Cell[][]; words: Word[] } | null = null;

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    const candidates = riggedCandidates(wordBank.filter(w => w.length >= 3 && w.length <= 7), difficulty);
    result = tryGenerateGrid(candidates);
    if (result) break;
  }
  if (!result) throw new Error('Could not generate a 20-word grid after max attempts');

  return finishGame(result, difficulty);
}

type ProgressCallback = (attempt: number, max: number, done: boolean) => void;

/** Async version of generateGame — yields between attempts so the UI can update. */
export async function generateGameAsync(
  wordBank: string[],
  onProgress: ProgressCallback,
  difficulty: number
): Promise<GameState> {
  let result: { grid: Cell[][]; words: Word[] } | null = null;

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    onProgress(attempt + 1, MAX_GEN_ATTEMPTS, false);
    await new Promise<void>(r => setTimeout(r, 0)); // yield to browser

    const candidates = riggedCandidates(wordBank.filter(w => w.length >= 4 && w.length <= 6), difficulty);
    result = tryGenerateGrid(candidates);
    if (result) break;
  }

  if (!result) throw new Error('Could not generate a 20-word grid after max attempts');

  onProgress(MAX_GEN_ATTEMPTS, MAX_GEN_ATTEMPTS, true);
  return finishGame(result, difficulty);
}

function finishGame(result: { grid: Cell[][]; words: Word[] }, difficulty: number): GameState {
  const { grid, words } = result;
  const N = GRID_SIZE;

  // Fill empty cells with random letters
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (!grid[r][c].letter) grid[r][c].letter = ALPHABET[randInt(26)];

  // Place wildcards — at most 1 per word, player must scratch them manually
  const singles: [number, number][] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (grid[r][c].wordIds.length === 1) singles.push([r, c]);

  const wordsWithWild = new Set<number>();
  shuffle(singles)
    .filter(([r, c]) => {
      const wordId = grid[r][c].wordIds[0];
      if (wordsWithWild.has(wordId)) return false;
      wordsWithWild.add(wordId);
      return true;
    })
    .slice(0, WILD_COUNT)
    .forEach(([r, c]) => { grid[r][c].isWild = true; });

  const finalWords = words.map(w => ({
    ...w,
    complete: w.cells.every(([r, c]) => grid[r][c].scratched),
  }));

  const { hand: handLetters, bonus: bonusLetters } = riggedHand(grid, difficulty);

  return {
    grid,
    words: finalWords,
    hand:  handLetters.map(l  => ({ letter: l, revealed: false })),
    bonus: bonusLetters.map(l => ({ letter: l, revealed: false })),
    revealedLetters:     new Set(),
    animatedCells:       new Set(),
    newlyAvailableCells: new Set(),
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function revealTile(state: GameState, idx: number, isBonus: boolean): GameState {
  const hand  = state.hand.map(t  => ({ ...t }));
  const bonus = state.bonus.map(t => ({ ...t }));
  const target = isBonus ? bonus : hand;

  if (target[idx].revealed) return state;
  target[idx].revealed = true;

  const revealedLetters = new Set([...state.revealedLetters, target[idx].letter]);

  const newLetter = target[idx].letter;
  const justAvailable = new Set<string>();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = state.grid[r][c];
      if (cell.letter === newLetter && cell.wordIds.length > 0 && !cell.scratched && !cell.isWild) {
        justAvailable.add(`${r},${c}`);
      }
    }
  }
  const newlyAvailableCells = new Set([...state.newlyAvailableCells, ...justAvailable]);

  return { ...state, hand, bonus, revealedLetters, animatedCells: new Set(), newlyAvailableCells };
}

export function scratchCell(state: GameState, r: number, c: number): GameState {
  const cell = state.grid[r][c];
  if (cell.scratched) return state;
  if (cell.wordIds.length === 0) return state;
  if (!cell.isWild && !state.revealedLetters.has(cell.letter)) return state;

  const grid = state.grid.map((row, ri) =>
    row.map((cl, ci) => ri === r && ci === c ? { ...cl, scratched: true } : cl)
  );

  const words = state.words.map(w => ({
    ...w,
    complete: w.cells.every(([wr, wc]) => grid[wr][wc].scratched),
  }));

  return { ...state, grid, words, animatedCells: new Set([`${r},${c}`]), newlyAvailableCells: new Set() };
}

export function revealAllHand(state: GameState): GameState {
  let s = state;
  s.hand.forEach((t, i) => { if (!t.revealed) s = revealTile(s, i, false); });
  return s;
}

export function revealAllBonus(state: GameState): GameState {
  let s = state;
  s.bonus.forEach((t, i) => { if (!t.revealed) s = revealTile(s, i, true); });
  return s;
}

export function scratchAllAvailable(state: GameState): GameState {
  const N = GRID_SIZE;
  let s = state;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cl = s.grid[r][c];
      if (!cl.scratched && cl.wordIds.length > 0 &&
          (cl.isWild || s.revealedLetters.has(cl.letter))) {
        s = scratchCell(s, r, c);
      }
    }
  return s;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function tileIsUseful(letter: string, state: GameState): boolean {
  return state.words.some(w =>
    !w.complete &&
    w.cells.some(([r, c]) =>
      state.grid[r][c].letter === letter && !state.grid[r][c].isWild
    )
  );
}
