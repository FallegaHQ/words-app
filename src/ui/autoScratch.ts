// ── Auto-scratch sequences ────────────────────────────────────────────────────
// Scratches all eligible cells one-by-one with delay (no cell click listeners).

import type { GameState } from '../types';

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Same rule as countAvail / scratchable cells for normal letters + wilds. */
export function isCellAutoScratchable(state: GameState, r: number, c: number): boolean {
  const cell = state.grid[r][c];
  return (
    cell.wordIds.length > 0 &&
    !cell.scratched &&
    (cell.isWild || state.revealedLetters.has(cell.letter))
  );
}

/** Wild stars only — used before tile drafting. */
export function collectWildScratchable(state: GameState): [number, number][] {
  const out: [number, number][] = [];
  const N = state.grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const cell = state.grid[r][c];
      if (cell.isWild && cell.wordIds.length > 0 && !cell.scratched) out.push([r, c]);
    }
  return out;
}

export function collectAutoScratchable(state: GameState): [number, number][] {
  const out: [number, number][] = [];
  const N = state.grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (isCellAutoScratchable(state, r, c)) out.push([r, c]);
    }
  return out;
}

export type AutoScratchSfx = (type: 'tick' | 'scratch') => void;

/**
 * Repeatedly scratches the first scratchable cell (row-major) until none remain.
 * `getState` must return the latest GameState after each `onScratch`.
 */
export async function autoScratchAvailable(
  getState: () => GameState,
  onScratch: (r: number, c: number) => void,
  delayMs: number,
  options: { wildOnly?: boolean; onSFX?: AutoScratchSfx } = {}
): Promise<void> {
  const { wildOnly = false, onSFX } = options;

  while (true) {
    const s = getState();
    const cells = wildOnly ? collectWildScratchable(s) : collectAutoScratchable(s);
    if (cells.length === 0) break;

    const [r, c] = cells[0];
    onSFX?.('tick');
    await delay(delayMs);
    onSFX?.('scratch');
    onScratch(r, c);
  }
}
