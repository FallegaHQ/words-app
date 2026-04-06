// ── Pure math / array utilities + seeded PRNG ────────────────────────────────
// Randomness for generation flows through optional `random: () => number` in
// [0, 1). Defaults to Math.random for non-seeded callers.

import type { Cell } from '../../types';

/** Uniform [0, 1) float producer (mulberry32 or Math.random). */
export type RandomFn = () => number;

/** FNV-1a 32-bit hash — stable, fast, good enough for PRNG seeding. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32: compact, fast PRNG; seed must be derived from hashSeed. */
export function mulberry32(seed: number): RandomFn {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(n: number, random: RandomFn = Math.random): number {
  return Math.floor(random() * n);
}

export function shuffle<T>(arr: T[], random: RandomFn = Math.random): T[] {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randInt(i + 1, random);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * Weighted sampling without replacement.
 * Draws `n` items from `pool` where each item's probability is proportional
 * to its corresponding weight.
 */
export function weightedSample(
  pool: string[],
  weights: number[],
  n: number,
  random: RandomFn = Math.random
): string[] {
  const p = [...pool];
  const w = [...weights];
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0 || !p.length) break;
    let r = random() * total;
    let idx = 0;
    while (idx < p.length - 1 && r > w[idx]) r -= w[idx++];
    result.push(p[idx]);
    p.splice(idx, 1);
    w.splice(idx, 1);
  }
  return result;
}

/**
 * Split `alphabet` (length 26) into `draftCount` contiguous segments as evenly as possible.
 * Example: 3 → sizes 9,8,8 for A–I, J–Q, R–Z.
 */
export function buildDraftSegments(alphabet: string, draftCount: number): string[][] {
  const letters = alphabet.split('');
  const n = letters.length;
  if (draftCount <= 0) return [];
  if (draftCount >= n) return letters.map(l => [l]);

  const base = Math.floor(n / draftCount);
  const rem = n % draftCount;
  const segments: string[][] = [];
  let i = 0;
  for (let s = 0; s < draftCount; s++) {
    const len = base + (s < rem ? 1 : 0);
    segments.push(letters.slice(i, i + len));
    i += len;
  }
  return segments;
}

/** Letters that appear on word cells (non-wild) in the grid. */
export function getGridLetters(grid: Cell[][]): Set<string> {
  const set = new Set<string>();
  for (const row of grid)
    for (const cell of row)
      if (cell.wordIds.length > 0 && !cell.isWild) set.add(cell.letter);
  return set;
}
