// ── Domain Types ─────────────────────────────────────────────────────────────

export interface Cell {
  letter:    string;
  wordIds:   number[];
  isWild:    boolean;
  scratched: boolean; // player has scratched this cell on the grid
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
  revealed: boolean; // player has scratched this hand/bonus tile
}

export interface HighScore {
  words: number;
  date:  string; // ISO timestamp
}

export interface GameState {
  grid:                Cell[][];
  words:               Word[];
  hand:                Tile[];   // unique random letters
  bonus:               Tile[];   // bonus letters, scratchable any time
  revealedLetters:     Set<string>;
  animatedCells:       Set<string>;  // cells that just got scratched (pop animation)
  newlyAvailableCells: Set<string>;  // cells that just became scratchable (discover animation)
}