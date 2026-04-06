import type { GridSizeKey, DifficultyKey } from './constants';

// ── Domain Types ──────────────────────────────────────────────────────────────

export interface Cell {
  letter:     string;
  wordIds:    number[];
  isWild:     boolean;
  scratched:  boolean;
  multiplier?: 2 | 3;
}

export interface Word {
  id:       number;
  text:     string;
  cells:    [number, number][];
  horiz:    boolean;
  complete: boolean;
}

export interface Tile {
  letter:   string;
  revealed: boolean;
}

// ── Config & Scoring ──────────────────────────────────────────────────────────

export interface GameConfig {
  difficulty:    number;
  difficultyKey: DifficultyKey;
  gridSizeKey:   GridSizeKey;
}

export interface HighScore {
  words:         number;
  total:         number;   // max words for this config
  score:         number;   // point score
  date:          string;   // ISO timestamp
  difficultyKey: DifficultyKey;
  gridSizeKey:   GridSizeKey;
}

// ── Game State ────────────────────────────────────────────────────────────────

export interface GameState {
  grid:                Cell[][];
  words:               Word[];
  hand:                Tile[];
  bonus:               Tile[];
  revealedLetters:     Set<string>;
  animatedCells:       Set<string>;
  newlyAvailableCells: Set<string>;
}
