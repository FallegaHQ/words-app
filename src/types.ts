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

export interface PrizeTier {
  words: number;
  prize: string;
}

export interface GameState {
  grid:            Cell[][];
  words:           Word[];
  hand:            Tile[];   // 18 unique random letters
  bonus:           Tile[];   // 2 unique random letters, scratchable any time
  revealedLetters:     Set<string>;
  animatedCells:       Set<string>;  // cells that just got scratched (for pop animation)
  newlyAvailableCells: Set<string>;  // cells that just became scratchable (for discover animation)
}