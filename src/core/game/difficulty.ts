// ── Difficulty / rigging algorithms ──────────────────────────────────────────
// Grid word order is seed-only (fair shuffle). Hand/bonus tiles use coverage weights.

import { ALPHABET } from '../../constants';
import type { Cell } from '../../types';
import { shuffle, weightedSample, type RandomFn } from './utils';

const FREQ_RANK: Record<string, number> = Object.fromEntries(
  'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('').map((l, i) => [l, i])
);

function wordDifficulty(word: string): number {
  return word.split('').reduce((s, l) => s + (FREQ_RANK[l] ?? 13), 0) / word.length;
}

/**
 * Shuffle + difficulty-biased sort for **hand assembly only** (not grid placement).
 * Harder settings surface rarer letters earlier in the sampling order influence.
 */
export function riggedTileSourceOrder(words: string[], difficulty: number, random: RandomFn): string[] {
  const shuffled = shuffle(words, random);
  const scored = shuffled.map(w => ({
    word: w,
    score: wordDifficulty(w) * difficulty + random() * (1 - difficulty) * 26,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.word);
}

/**
 * Grid generation: difficulty must **not** affect which words appear — only the seed.
 * Pure shuffle of the eligible word list.
 */
export function shuffleWordBankForGrid(words: string[], random: RandomFn): string[] {
  return shuffle(words, random);
}

/**
 * Deal hand + bonus tiles biased by difficulty.
 * `guaranteedLetters` are placed at the start of the hand (in order, deduped),
 * then remaining slots are filled from weighted sampling (excluding used letters).
 */
export function riggedHand(
  grid: Cell[][],
  difficulty: number,
  handSize: number,
  bonusSize: number,
  random: RandomFn,
  guaranteedLetters: string[] = []
): { hand: string[]; bonus: string[] } {
  const coverage: Record<string, number> = Object.fromEntries(
    ALPHABET.split('').map(l => [l, 0])
  );
  for (const row of grid)
    for (const cell of row)
      if (cell.wordIds.length > 0 && !cell.isWild)
        coverage[cell.letter]++;

  const seen = new Set<string>();
  const guaranteed: string[] = [];
  for (const raw of guaranteedLetters) {
    const L = raw.toUpperCase();
    if (!/[A-Z]/.test(L) || seen.has(L)) continue;
    seen.add(L);
    guaranteed.push(L);
    if (guaranteed.length >= handSize) break;
  }

  const needFromPool = handSize - guaranteed.length + bonusSize;
  const pool = ALPHABET.split('').filter(l => !seen.has(l));
  const weights = pool.map(l => 1 / Math.pow(coverage[l] + 1, difficulty));
  const extra = weightedSample(pool, weights, needFromPool, random);

  const hand = [...guaranteed, ...extra.slice(0, handSize - guaranteed.length)];
  const bonus = extra.slice(handSize - guaranteed.length, handSize - guaranteed.length + bonusSize);

  return { hand, bonus };
}
