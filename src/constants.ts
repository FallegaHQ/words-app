import type { PrizeTier } from './types';

export const GRID_SIZE        = 11;
export const TARGET_WORDS     = 20;
export const HAND_SIZE        = 16;
export const BONUS_SIZE       = 3;
export const WILD_COUNT       = 3;
export const MAX_GEN_ATTEMPTS = 150;
export const ALPHABET         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * How aggressively the game is rigged against the player.
 * 0 = perfectly fair (pure random)
 * 1 = fully rigged (worst possible letters, hardest possible words)
 * Recommended sweet spot: 0.7–0.85
 */
export const DIFFICULTY = 0.55;
 
export const PRIZES: PrizeTier[] = [
  { words: 2,  prize: '0' },
  { words: 3,  prize: '1' },
  { words: 5,  prize: '2' },
  { words: 7,  prize: '3' },
  { words: 9,  prize: '4' },
  { words: 10, prize: '5' }
];


