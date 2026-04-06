import { ACHIEVEMENTS, GRID_CONFIGS } from '../constants';
import type { GameState, GameConfig } from '../types';
import { computeScore } from './gameLogic';
import { loadAchievements, saveAchievements } from './storage';

export function checkAchievements(
  s: GameState, config: GameConfig, elapsedMs: number
): { id: string; icon: string; title: string }[] {
  const data       = loadAchievements();
  const doneWords  = s.words.filter(w => w.complete);
  const score      = computeScore(s);
  const totalWords = GRID_CONFIGS[config.gridSizeKey].targetWords;

  const wildcardCells   = s.grid.flat().filter(c => c.isWild);
  const allWildScratched = wildcardCells.every(c => c.scratched);
  const allScratched     = s.grid.flat().every(c => c.wordIds.length === 0 || c.scratched);

  const wordsNoWild = doneWords.filter(w =>
    !w.cells.some(([r, c]) => s.grid[r][c].isWild)
  );

  const conditions: Record<string, boolean> = {
    'first_word':      doneWords.length >= 1,
    'find_5_words':    doneWords.length >= 5,
    'find_10_words':   doneWords.length >= 10,
    'perfect_card':    doneWords.length === totalWords,
    'hard_15_words':   config.difficultyKey === 'hard' && doneWords.length >= 15,
    '7_letter_word':   doneWords.some(w => w.text.length >= 7),
    '8_letter_word':   doneWords.some(w => w.text.length >= 8),
    '5_words_no_wild': wordsNoWild.length >= 5,
    'triple_word':     doneWords.some(w => w.cells.some(([r, c]) => s.grid[r][c].multiplier === 3)),
    'high_scorer':     score >= 500,
    'lucky_draw_win':  s.luckyDrawUsed && doneWords.length > 0,
    'speed_demon':     elapsedMs > 0 && elapsedMs < 180_000 && doneWords.length >= 10,
    'fog_explorer':    allScratched,
    'wildcard_master': wildcardCells.length > 0 && allWildScratched,
  };

  const newlyUnlocked: { id: string; icon: string; title: string }[] = [];

  for (const ach of ACHIEVEMENTS) {
    const already = data[ach.id]?.unlocked ?? false;
    if (!already && conditions[ach.id]) {
      data[ach.id] = { unlocked: true, unlockedAt: new Date().toISOString() };
      newlyUnlocked.push({ id: ach.id, icon: ach.icon, title: ach.title });
    }
  }

  if (newlyUnlocked.length) saveAchievements(data);
  return newlyUnlocked;
}
