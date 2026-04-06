import type { GridSizeKey, DifficultyKey } from './constants';

/** How the game seed was chosen (affects UI: daily challenge hides seed). */
export type SeedMode = 'random' | 'daily' | 'custom' | 'daily_challenge';

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
  /** Deterministic identity for grid generation + hand stream */
  seed:          string;
  seedMode:      SeedMode;
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
  /** Player-chosen letters from the draft phase (uppercase), in pick order */
  draftedLetters:      string[];
}

// ── Per-frame UI-only context (not part of saved game logic) ─────────────────

export interface DraftUiState {
  segments:     string[][];
  segmentIndex: number;
  picks:        string[];
}

/**
 * Passed into `render` so the hand panel / header can show drafting, status text,
 * and whether the words list button exists in the DOM.
 */
export interface GameViewContext {
  /** Shown under the section title in the hand area */
  handStatusMessage: string;
  /** When false, `#btn-words` is omitted from the DOM entirely */
  showWordsButton: boolean;
  draft: null | DraftUiState;
  seedDisplay: string | null;
  /** Daily challenge: do not show seed / copy in header */
  hideSeedInHeader: boolean;
  /** Block clicks on hand/bonus tiles (auto-scratch in progress) */
  lockHandTileClicks: boolean;
  /**
   * When set, replaces the normal tile grid with this message only
   * (e.g. after Lucky Draw, or “Preparing…”).
   */
  handPanelMessageOnly: string | null;
  /** End-game countdown seconds, or null */
  showCountdown: number | null;
  /**
   * True while auto-scratch runs or end-game countdown: blocks grid + hand + lucky
   * (header + score bar + hub/new-ticket buttons stay usable per guide).
   */
  interactionLocked: boolean;
}

// ── UI Callbacks ──────────────────────────────────────────────────────────────

export interface RenderCallbacks {
  onRevealTile:       (idx: number, isBonus: boolean) => void;
  /** Draft phase: player picked a letter in the current segment */
  onDraftPick?:       (letter: string) => void;
  onScratchCell:      (r: number, c: number) => void;
  onLuckyDrawPick:    (letter: string) => void;
  onNewGame:          () => void;
  onReturnToHub:      () => void;
  onWordClick:        (word: string, onDefinitionClosed: () => void) => void;
  onShowHighScores:   () => void;
  onShowAchievements: () => void;
}
