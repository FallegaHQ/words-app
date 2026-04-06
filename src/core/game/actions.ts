// ── Player action state transitions ──────────────────────────────────────────
// Each exported function takes the current GameState and returns a new one.
// All state is treated as immutable — original objects are never mutated.

import type { GameState } from '../../types';
import { revealAdjacentCells, revealEntireGrid } from './fog';

/** End-game: lift fog on every cell so the full card is visible. */
export function revealFullGridFog(state: GameState): GameState {
  const fog = new Set<string>();
  const N = state.grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      fog.add(`${r},${c}`);
  return { ...state, fogRevealed: fog };
}

// ── Reveal a hand or bonus tile ───────────────────────────────────────────────

export function revealTile(state: GameState, idx: number, isBonus: boolean): GameState {
  const hand  = state.hand .map(t => ({ ...t }));
  const bonus = state.bonus.map(t => ({ ...t }));
  const target = isBonus ? bonus : hand;

  if (target[idx].revealed) return state; // already revealed — no-op

  target[idx].revealed = true;
  const newLetter      = target[idx].letter;
  const revealedLetters = new Set([...state.revealedLetters, newLetter]);

  const N = state.grid.length;
  const newFog         = new Set([...state.fogRevealed]);
  const justAvailable  = new Set<string>();

  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = state.grid[r][c];
      if (cell.letter === newLetter && cell.wordIds.length > 0 && !cell.isWild) {
        newFog.add(`${r},${c}`);                            // lift fog over matching cell
        if (!cell.scratched) justAvailable.add(`${r},${c}`); // mark as newly available
      }
    }

  return {
    ...state, hand, bonus, revealedLetters,
    fogRevealed:         newFog,
    animatedCells:       new Set(),
    newlyAvailableCells: new Set([...state.newlyAvailableCells, ...justAvailable]),
  };
}

// ── Scratch a grid cell ───────────────────────────────────────────────────────

export function scratchCell(state: GameState, r: number, c: number): GameState {
  const cell = state.grid[r][c];

  // Guard: already scratched, filler cell, or letter not yet revealed
  if (cell.scratched)                                              return state;
  if (cell.wordIds.length === 0)                                   return state;
  if (!cell.isWild && !state.revealedLetters.has(cell.letter))    return state;

  // Immutably update the grid
  const grid = state.grid.map((row, ri) =>
    row.map((cl, ci) => ri === r && ci === c ? { ...cl, scratched: true } : cl)
  );

  // Re-evaluate word completion
  const words = state.words.map(w => ({
    ...w,
    complete: w.cells.every(([wr, wc]) => grid[wr][wc].scratched),
  }));

  // Fog: scratching reveals adjacent cells; full reveal if board is cleared
  const newFog = new Set([...state.fogRevealed]);
  revealAdjacentCells(newFog, grid, r, c);
  const allScratched = grid.flat().every(cl => cl.wordIds.length === 0 || cl.scratched);
  if (allScratched) revealEntireGrid(newFog, grid);

  return {
    ...state, grid, words,
    fogRevealed:         newFog,
    animatedCells:       new Set([`${r},${c}`]),
    newlyAvailableCells: new Set(),
  };
}

// ── Use the Lucky Draw (once per game) ───────────────────────────────────────

export function useLuckyDrawTile(state: GameState, letter: string): GameState {
  if (state.luckyDrawUsed) return state; // guard: only once

  const N = state.grid.length;
  const revealedLetters = new Set([...state.revealedLetters, letter]);
  const newFog          = new Set([...state.fogRevealed]);
  const justAvailable   = new Set<string>();

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
    fogRevealed:         newFog,
    luckyDrawUsed:       true,
    animatedCells:       new Set(),
    newlyAvailableCells: new Set([...state.newlyAvailableCells, ...justAvailable]),
  };
}

// ── Tile utility query ────────────────────────────────────────────────────────

/**
 * Returns true if revealing this letter would help complete at least one
 * unfinished word (used to highlight useful tiles in the hand panel).
 */
export function tileIsUseful(letter: string, state: GameState): boolean {
  return state.words.some(w =>
    !w.complete &&
    w.cells.some(([r, c]) =>
      state.grid[r][c].letter === letter && !state.grid[r][c].isWild
    )
  );
}
