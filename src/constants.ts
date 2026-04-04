import type { PrizeTier } from './types';

export const GRID_SIZE        = 11;
export const TARGET_WORDS     = 20;
export const HAND_SIZE        = 16;
export const BONUS_SIZE       = 2;
export const WILD_COUNT       = 3;
export const MAX_GEN_ATTEMPTS = 120;
export const ALPHABET         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * How aggressively the game is rigged against the player.
 * 0 = perfectly fair (pure random)
 * 1 = fully rigged (worst possible letters, hardest possible words)
 * Recommended sweet spot: 0.7–0.85
 */
export const DIFFICULTY = 0.5;
 
export const PRIZES: PrizeTier[] = [
  { words: 3,  prize: '$3' },
  { words: 5,  prize: '$15' },
  { words: 7,  prize: '$50' },
  { words: 9,  prize: '$200' },
  { words: 11, prize: '$1,000' },
  { words: 13, prize: '$5,000' },
  { words: 16, prize: '$25,000' },
  { words: 18, prize: '$100,000' },
  { words: 20, prize: '$1,000,000' },
];


