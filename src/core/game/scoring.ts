// ── Score computation ─────────────────────────────────────────────────────────
// Pure functions — take state/grid data, return numbers. No side effects.

import { LETTER_SCORES } from '../../constants';
import type { Word, GameState } from '../../types';
import type { Cell } from '../../types';

/**
 * Score for a single completed word.
 * Sums the Scrabble-style letter scores for all scratched cells in the word,
 * then applies the highest multiplier found among those cells (2× or 3×).
 * Wild cells count as 1 point each.
 */
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

/** Total score across all completed words in the current game. */
export function computeScore(state: GameState): number {
  return state.words
    .filter(w => w.complete)
    .reduce((sum, w) => sum + computeWordScore(w, state.grid), 0);
}
