// ── Difficulty / rigging algorithms ──────────────────────────────────────────
// Controls which words are chosen and which hand tiles are dealt, based on
// the difficulty setting. Higher difficulty → rarer letters, harder words.

import { ALPHABET } from '../../constants';
import type { Cell } from '../../types';
import { shuffle, weightedSample } from './utils';

// Letter frequency rank (most common = 0). Scrabble-inspired, used to gauge
// how "easy" a word's letter set is for the player.
const FREQ_RANK: Record<string, number> = Object.fromEntries(
  'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('').map((l, i) => [l, i])
);

/** Returns a 0–25 score for a word: higher = rarer/harder letters. */
function wordDifficulty(word: string): number {
  return word.split('').reduce((s, l) => s + (FREQ_RANK[l] ?? 13), 0) / word.length;
}

/**
 * Sort a shuffled word list so that at the requested difficulty level,
 * harder words (rare letters) surface towards the top.
 *
 * difficulty 0 → common letters dominate
 * difficulty 1 → rare letters dominate
 */
export function riggedCandidates(words: string[], difficulty: number): string[] {
  const shuffled = shuffle(words);
  const scored = shuffled.map(w => ({
    word: w,
    score: wordDifficulty(w) * difficulty + Math.random() * (1 - difficulty) * 26,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.word);
}

/**
 * Deal a hand of tiles that is intentionally biased by difficulty.
 *
 * At low difficulty, tiles are more likely to match frequent grid letters
 * (making more cells immediately scratchable). At high difficulty, the
 * sampling weight is flatter so useful letters are rarer in the hand.
 */
export function riggedHand(
  grid: Cell[][], difficulty: number, handSize: number, bonusSize: number
): { hand: string[]; bonus: string[] } {
  // Count how many word-cells on the grid use each letter
  const coverage: Record<string, number> = Object.fromEntries(
    ALPHABET.split('').map(l => [l, 0])
  );
  for (const row of grid)
    for (const cell of row)
      if (cell.wordIds.length > 0 && !cell.isWild)
        coverage[cell.letter]++;

  // Weight: high coverage + low difficulty → high weight (easy to unlock cells)
  // weight = 1 / coverage^difficulty  means easy mode skews toward common letters
  const letters = ALPHABET.split('');
  const weights = letters.map(l => 1 / Math.pow(coverage[l] + 1, difficulty));

  const all = weightedSample(letters, weights, handSize + bonusSize);
  return {
    hand:  all.slice(0, handSize),
    bonus: all.slice(handSize),
  };
}
