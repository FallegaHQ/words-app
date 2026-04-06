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
  large:  { size: 15, targetWords: 30, handSize: 16, bonusSize: 3, wildCount: 4, minWordLen: 4, maxWordLen: 9, doubleCount: 4, tripleCount: 3 },
} as const;

export type GridSizeKey = keyof typeof GRID_CONFIGS;

// ── Difficulty presets ────────────────────────────────────────────────────────

export const DIFFICULTY_PRESETS = {
  easy:   0.2,
  medium: 0.55,
  hard:   0.85,
} as const;

export type DifficultyKey = keyof typeof DIFFICULTY_PRESETS;

// ── Achievements ──────────────────────────────────────────────────────────────

import type { AchievementDef } from './types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_word',      icon: '🎉', title: 'First Word',      description: 'Complete your first word on any card.' },
  { id: 'find_5_words',    icon: '📝', title: 'Word Collector',  description: 'Find 5 or more words in a single card.' },
  { id: 'find_10_words',   icon: '📚', title: 'Word Hoarder',    description: 'Find 10 or more words in a single card.' },
  { id: 'perfect_card',    icon: '🌟', title: 'Perfect Card',    description: 'Find every single word on a card.' },
  { id: 'hard_15_words',   icon: '🔥', title: 'Grandmaster',     description: 'Finish a Hard game with 15 or more words.' },
  { id: '7_letter_word',   icon: '🔠', title: 'Big Speller',     description: 'Complete a word that is 7 letters long.' },
  { id: '8_letter_word',   icon: '🧩', title: 'Mega Speller',    description: 'Complete a word that is 8 letters long.' },
  { id: '5_words_no_wild', icon: '🏆', title: 'Pure Play',       description: 'Find 5 words in a card that contain no wildcard cells.' },
  { id: 'triple_word',     icon: '🎯', title: 'Triple Threat',   description: 'Complete a word that contains a 3× multiplier cell.' },
  { id: 'high_scorer',     icon: '💎', title: 'High Roller',     description: 'Score 500 or more points in a single game.' },
  { id: 'lucky_draw_win',  icon: '🍀', title: 'Lucky Break',     description: 'Use the Lucky Draw to help complete a word.' },
  { id: 'speed_demon',     icon: '⚡', title: 'Speed Demon',     description: 'Complete 10 or more words in under 3 minutes.' },
  { id: 'fog_explorer',    icon: '🌫️', title: 'Fog Explorer',    description: 'Scratch every cell on a card (reveal the whole grid).' },
  { id: 'wildcard_master', icon: '⭐', title: 'Wildcard Master', description: 'Scratch all wildcard cells on a card.' },
];
