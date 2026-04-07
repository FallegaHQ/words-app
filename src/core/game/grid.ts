// ── Crossword grid builder ────────────────────────────────────────────────────
// Handles grid initialisation, word-placement validation, word placement, and
// multiplier distribution. Pure algorithmic logic — no game state or scoring.

import type { Cell, Word } from '../../types';
import { shuffle, randInt, type RandomFn } from './utils';

// ── Grid initialisation ───────────────────────────────────────────────────────

export function makeGrid(size: number): Cell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      letter: '', wordIds: [], isWild: false, scratched: false,
    }))
  );
}

// ── Letter position index ─────────────────────────────────────────────────────
// Maps each letter → all grid cells that contain it, annotated with the
// direction of the word that placed it there. Maintained incrementally so
// tryPlaceOneWord never has to re-scan placed words.

export interface LetterCell {
  r: number;
  c: number;
  /** Direction of the word that put this letter here. */
  existingHoriz: boolean;
}

/** letter → list of placed cells carrying that letter */
export type LetterIndex = Map<string, LetterCell[]>;

export function makeLetterIndex(): LetterIndex {
  return new Map();
}

// ── Placement validation ──────────────────────────────────────────────────────

/**
 * Returns true if `word` can be placed at (sr, sc) in the given direction
 * without violating crossword constraints:
 *   - fits within grid bounds
 *   - no conflicting letters at shared cells
 *   - no parallel neighbours touching the word's non-shared cells
 *   - at least one letter must cross an existing word
 */
export function canPlace(
  grid: Cell[][], words: Word[], word: string,
  sr: number, sc: number, horiz: boolean
): boolean {
  const N = grid.length, len = word.length;
  const er = horiz ? sr       : sr + len - 1;
  const ec = horiz ? sc + len - 1 : sc;

  if (sr < 0 || er >= N || sc < 0 || ec >= N) return false;

  // No letter may directly precede or follow the word along its axis
  if (horiz) {
    if (sc > 0       && grid[sr][sc - 1].letter) return false;
    if (ec < N - 1   && grid[sr][ec + 1].letter) return false;
  } else {
    if (sr > 0       && grid[sr - 1][sc].letter) return false;
    if (er < N - 1   && grid[er + 1][sc].letter) return false;
  }

  let crossings = 0;
  for (let i = 0; i < len; i++) {
    const r = horiz ? sr     : sr + i;
    const c = horiz ? sc + i : sc;

    if (grid[r][c].letter) {
      // Shared cell: letters must match, and no other word in the same direction
      if (grid[r][c].letter !== word[i]) return false;
      if (grid[r][c].wordIds.some(id => words[id]?.horiz === horiz)) return false;
      crossings++;
    } else {
      // Empty cell: no parallel neighbour allowed (would create unintended words)
      if (horiz) {
        if ((r > 0     && grid[r - 1][c].letter) ||
            (r < N - 1 && grid[r + 1][c].letter)) return false;
      } else {
        if ((c > 0     && grid[r][c - 1].letter) ||
            (c < N - 1 && grid[r][c + 1].letter)) return false;
      }
    }
  }

  return crossings > 0; // Must cross at least one existing word
}

// ── Placement ─────────────────────────────────────────────────────────────────

export function placeWord(
  grid: Cell[][], words: Word[], word: string,
  sr: number, sc: number, horiz: boolean, id: number,
  index?: LetterIndex
): void {
  const cells: [number, number][] = [];
  for (let i = 0; i < word.length; i++) {
    const r = horiz ? sr     : sr + i;
    const c = horiz ? sc + i : sc;
    grid[r][c].letter = word[i];
    grid[r][c].wordIds.push(id);
    cells.push([r, c]);

    if (index) {
      const entry: LetterCell = { r, c, existingHoriz: horiz };
      const bucket = index.get(word[i]);
      if (bucket) bucket.push(entry);
      else index.set(word[i], [entry]);
    }
  }
  words.push({ id, text: word, cells, horiz, complete: false });
}

/**
 * Finds every valid position where `word` can cross an already-placed word,
 * picks one at random, and places it. Returns true on success.
 *
 * When a LetterIndex is provided (strongly recommended for performance), the
 * inner search is O(word_len × cells_per_letter) instead of the naive
 * O(placed_words × placed_len × word_len), giving a significant speedup on
 * dense grids.
 */
export function tryPlaceOneWord(
  grid: Cell[][], words: Word[], word: string, id: number,
  random: RandomFn = Math.random,
  index?: LetterIndex
): boolean {
  const opts: { sr: number; sc: number; horiz: boolean }[] = [];

  if (index) {
    // Fast path: look up each letter of the candidate in the index rather
    // than scanning all placed words and their cells.
    for (let wi = 0; wi < word.length; wi++) {
      const cells = index.get(word[wi]);
      if (!cells) continue;
      for (const { r, c, existingHoriz } of cells) {
        // New word must be perpendicular to the existing one at this cell.
        const newHoriz = !existingHoriz;
        const sr = newHoriz ? r       : r - wi;
        const sc = newHoriz ? c - wi  : c;
        if (canPlace(grid, words, word, sr, sc, newHoriz))
          opts.push({ sr, sc, horiz: newHoriz });
      }
    }
  } else {
    // Fallback: original O(placed × placed_len × word_len) scan.
    for (const pw of words) {
      for (let pi = 0; pi < pw.text.length; pi++) {
        for (let wi = 0; wi < word.length; wi++) {
          if (pw.text[pi] !== word[wi]) continue;
          const [pr, pc] = pw.cells[pi];
          if (pw.horiz) {
            const sr = pr - wi, sc = pc;
            if (canPlace(grid, words, word, sr, sc, false))
              opts.push({ sr, sc, horiz: false });
          } else {
            const sr = pr, sc = pc - wi;
            if (canPlace(grid, words, word, sr, sc, true))
              opts.push({ sr, sc, horiz: true });
          }
        }
      }
    }
  }

  if (!opts.length) return false;
  const o = opts[randInt(opts.length, random)];
  placeWord(grid, words, word, o.sr, o.sc, o.horiz, id, index);
  return true;
}

// ── Multiplier placement ──────────────────────────────────────────────────────

/**
 * Distribute 2× and 3× multiplier markers across word cells.
 * At most one multiplier per word (uses the word's primaryWordId to track).
 */
export function placeMultipliers(
  grid: Cell[][], doubleCount: number, tripleCount: number,
  random: RandomFn = Math.random
): void {
  const N = grid.length;
  const candidates: { r: number; c: number; primaryWordId: number }[] = [];

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = grid[r][c];
      if (cell.wordIds.length > 0 && !cell.isWild)
        candidates.push({ r, c, primaryWordId: cell.wordIds[0] });
    }

  const usedWords = new Set<number>();
  let placed3 = 0, placed2 = 0;

  for (const { r, c, primaryWordId } of shuffle(candidates, random)) {
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