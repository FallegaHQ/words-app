// ── Fog-of-war helpers ────────────────────────────────────────────────────────
// Manages which grid cells are visible to the player.
// Cells start hidden; scratching a cell reveals its 4-directional neighbours.

import type { Cell } from '../../types';

/**
 * Add all word-bearing cells adjacent to (r, c) into the fog-revealed set.
 * Called after every scratch so nearby cells become visible.
 */
export function revealAdjacentCells(fog: Set<string>, grid: Cell[][], r: number, c: number): void {
  const N = grid.length;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr][nc].wordIds.length > 0)
      fog.add(`${nr},${nc}`);
  }
}

/** Reveal every cell on the grid (called when all scratchable cells are done). */
export function revealEntireGrid(fog: Set<string>, grid: Cell[][]): void {
  const N = grid.length;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      fog.add(`${r},${c}`);
}
