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
  total:         number;
  score:         number;
  date:          string;
  difficultyKey: DifficultyKey;
  gridSizeKey:   GridSizeKey;
}

// ── Achievements ──────────────────────────────────────────────────────────────

export interface AchievementDef {
  id:          string;
  title:       string;
  description: string;
  icon:        string;
}

export interface AchievementRecord {
  unlocked:    boolean;
  unlockedAt?: string;
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
  fogRevealed:         Set<string>;
  luckyDrawUsed:       boolean;
  luckyDrawPool:       string[];
  initialHandLetters:  string[];
}

// ── UI Callbacks ──────────────────────────────────────────────────────────────

export interface RenderCallbacks {
  onRevealTile:       (idx: number, isBonus: boolean) => void;
  onScratchCell:      (r: number, c: number) => void;
  onLuckyDrawPick:    (letter: string) => void;
  onNewGame:          () => void;
  onWordClick:        (word: string, onDefinitionClosed: () => void) => void;
  onShowHighScores:   () => void;
  onShowAchievements: () => void;
}
