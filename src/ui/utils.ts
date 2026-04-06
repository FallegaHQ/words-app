import type { GridSizeKey } from '../constants';
import { GRID_CONFIGS } from '../constants';

export function diffLabel(difficulty: number): string {
  return difficulty <= 0.3 ? '🌴 Easy' : difficulty <= 0.65 ? '⚡ Medium' : '🔥 Hard';
}

export function sizeLabel(key: GridSizeKey): string {
  const c = GRID_CONFIGS[key];
  return `${c.size}×${c.size}`;
}

export function scoreToStars(words: number, total: number): string {
  const ratio = words / total;
  const n = ratio === 0 ? 0 : ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.6 ? 3 : ratio < 0.85 ? 4 : 5;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function formatDuration(ms: number): string {
  const s   = Math.floor(ms / 1000);
  const m   = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}
