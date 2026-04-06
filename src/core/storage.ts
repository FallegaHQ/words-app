import { GRID_CONFIGS } from '../constants';
import type { DifficultyKey, GridSizeKey } from '../constants';
import type { GameState, GameConfig, HighScore, AchievementRecord } from '../types';
import { computeScore } from './gameLogic';

// ── High Scores ───────────────────────────────────────────────────────────────

function hsKey(diffKey: DifficultyKey, sizeKey: GridSizeKey): string {
  return `luckyLetters_hs_${diffKey}_${sizeKey}`;
}

export function getScoresFor(diffKey: DifficultyKey, sizeKey: GridSizeKey): HighScore[] {
  try {
    const raw = localStorage.getItem(hsKey(diffKey, sizeKey));
    return raw ? (JSON.parse(raw) as HighScore[]) : [];
  } catch { return []; }
}

export function getAllScores(): Partial<Record<DifficultyKey, Partial<Record<GridSizeKey, HighScore[]>>>> {
  const diffKeys: DifficultyKey[] = ['easy', 'medium', 'hard'];
  const sizeKeys: GridSizeKey[]   = ['small', 'normal', 'large'];
  const result: Partial<Record<DifficultyKey, Partial<Record<GridSizeKey, HighScore[]>>>> = {};
  for (const d of diffKeys) {
    result[d] = {};
    for (const s of sizeKeys) result[d]![s] = getScoresFor(d, s);
  }
  return result;
}

export function saveScore(state: GameState, config: GameConfig): void {
  const wordsComplete = state.words.filter(w => w.complete).length;
  const score  = computeScore(state);
  const scores = getScoresFor(config.difficultyKey, config.gridSizeKey);
  scores.push({
    words:         wordsComplete,
    total:         GRID_CONFIGS[config.gridSizeKey].targetWords,
    score,
    date:          new Date().toISOString(),
    difficultyKey: config.difficultyKey,
    gridSizeKey:   config.gridSizeKey,
  });
  scores.sort((a, b) => b.score - a.score || b.words - a.words);
  try {
    localStorage.setItem(hsKey(config.difficultyKey, config.gridSizeKey), JSON.stringify(scores.slice(0, 100)));
  } catch { /* storage full */ }
}

// ── Achievements ──────────────────────────────────────────────────────────────

export function loadAchievements(): Record<string, AchievementRecord> {
  try {
    const raw = localStorage.getItem('luckyLetters_achievements');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveAchievements(data: Record<string, AchievementRecord>): void {
  try { localStorage.setItem('luckyLetters_achievements', JSON.stringify(data)); } catch {}
}

export function getUnlockedIds(): Set<string> {
  const data = loadAchievements();
  return new Set(Object.entries(data).filter(([, v]) => v.unlocked).map(([k]) => k));
}
