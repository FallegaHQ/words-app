// ── Pure math / array utilities ───────────────────────────────────────────────
// No project imports. Safe to use anywhere without risk of circular deps.

export function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

export function shuffle<T>(arr: T[]): T[] {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * Weighted sampling without replacement.
 * Draws `n` items from `pool` where each item's probability is proportional
 * to its corresponding weight. Both arrays are treated as immutable.
 */
export function weightedSample(pool: string[], weights: number[], n: number): string[] {
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
