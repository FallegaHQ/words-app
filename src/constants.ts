export const MAX_GEN_ATTEMPTS = 150;
export const ALPHABET         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Letter rarity scores (Scrabble-inspired) ──────────────────────────────────

export const LETTER_SCORES: Record<string, number> = {
  A:1, E:1, I:1, O:1, U:1, L:1, N:1, R:1, S:1, T:1,
  D:2, G:2,
  B:3, C:3, M:3, P:3,
  F:4, H:4, V:4, W:4, Y:4,
  K:5,
  J:8, X:8,
  Q:10, Z:10,
};

// ── Grid configurations ───────────────────────────────────────────────────────

export const GRID_CONFIGS = {
  small:  { size:  9, targetWords: 10, handSize: 10, bonusSize: 2, wildCount: 2, minWordLen: 2, maxWordLen: 5, doubleCount: 2, tripleCount: 1 },
  normal: { size: 11, targetWords: 20, handSize: 14, bonusSize: 2, wildCount: 3, minWordLen: 4, maxWordLen: 6, doubleCount: 3, tripleCount: 2 },
  large:  { size: 15, targetWords: 30, handSize: 16, bonusSize: 3, wildCount: 4, minWordLen: 4, maxWordLen: 8, doubleCount: 4, tripleCount: 3 },
} as const;

export type GridSizeKey = keyof typeof GRID_CONFIGS;

// ── Difficulty presets ────────────────────────────────────────────────────────

export const DIFFICULTY_PRESETS = {
  easy:   0.2,
  medium: 0.55,
  hard:   0.85,
} as const;

export type DifficultyKey = keyof typeof DIFFICULTY_PRESETS;