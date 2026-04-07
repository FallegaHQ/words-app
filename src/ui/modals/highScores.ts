import { createOverlay, closeModalById, onEscape } from './base';
import { GRID_CONFIGS } from '../../constants';
import type { DifficultyKey, GridSizeKey } from '../../constants';
import type { GameConfig, HighScore } from '../../types';
import { formatDuration } from '../utils';

const ID = 'hs-modal-overlay';
type ScoresMap = Partial<Record<DifficultyKey, Partial<Record<GridSizeKey, HighScore[]>>>>;

export function showHighScoreModal(scores: ScoresMap, currentConfig: GameConfig): void {
  let selDiff = currentConfig.difficultyKey;
  let selSize = currentConfig.gridSizeKey;

  const diffKeys: DifficultyKey[] = ['easy', 'medium', 'hard'];
  const sizeKeys: GridSizeKey[]   = ['small', 'normal', 'large'];
  const diffLabels: Record<DifficultyKey, string> = { easy: '🌴 Easy', medium: '⚡ Med', hard: '🔥 Hard' };
  const sizeLabels: Record<GridSizeKey,   string> = { small: 'Small', normal: 'Normal', large: 'Large' };

  function starsGrid(words: number, total: number): string {
    const ratio = words / total;
    const n = ratio === 0 ? 0 : ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.6 ? 3 : ratio < 0.85 ? 4 : 5;
    const all = '★'.repeat(n) + '☆'.repeat(5 - n);
    return `<span class="hs-stars-row">${all.slice(0, 3)}</span><span class="hs-stars-row">${all.slice(3)}</span>`;
  }

  function buildRows(d: DifficultyKey, s: GridSizeKey): string {
    const list = scores[d]?.[s] ?? [];
    const top  = [...list].sort((a, b) => b.score - a.score || b.words - a.words).slice(0, 10);
    if (!top.length) return `<tr><td colspan="6" class="hs-empty">No scores yet</td></tr>`;
    return top.map((sc, i) => {
      const d2   = new Date(sc.date);
      const date = d2.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const time = d2.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const dur   = sc.elapsedMs ? formatDuration(sc.elapsedMs) : '—';
      const pts   = sc.score > 0 ? sc.score.toLocaleString() : '—';
      const seedCell = sc.seed
        ? `<button class="hs-seed-copy" data-seed="${sc.seed}" title="Copy seed: ${sc.seed}">📋</button>`
        : `<span class="hs-seed-na">—</span>`;
      return `<tr class="${i === 0 ? 'hs-top' : ''}">
        <td class="hs-rank">${medal}</td>
        <td class="hs-score">${sc.words}<span class="hs-total"> / ${sc.total}</span></td>
        <td class="hs-pts">${pts}</td>
        <td class="hs-stars">${starsGrid(sc.words, sc.total)}</td>
        <td class="hs-dur">${dur}</td>
        <td class="hs-seed">${seedCell}</td>
        <td class="hs-date">${date}<br><span class="hs-time">${time}</span></td>
      </tr>`;
    }).join('');
  }

  // Overlay is re-rendered in place on filter change
  const overlay = createOverlay(ID, '');

  function render() {
    const cfg = GRID_CONFIGS[selSize];
    overlay.innerHTML = `
      <div class="def-modal hs-modal" role="dialog" aria-modal="true">
        <div class="def-modal-header">
          <span class="def-modal-word">🏆 High Scores</span>
          <button class="def-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="def-modal-body hs-body">
          <div class="hs-filters">
            <div class="hs-filter-row">
              ${diffKeys.map(k => `<button class="hs-filter-pill${k === selDiff ? ' active' : ''}" data-diff="${k}">${diffLabels[k]}</button>`).join('')}
            </div>
            <div class="hs-filter-row">
              ${sizeKeys.map(k => `<button class="hs-filter-pill${k === selSize ? ' active' : ''}" data-size="${k}">${sizeLabels[k]}</button>`).join('')}
            </div>
          </div>
          <div class="hs-context">${diffLabels[selDiff]} · ${cfg.size}×${cfg.size} · ${cfg.targetWords} words</div>
          <div class="hs-table-wrap">
          <table class="hs-table">
            <thead><tr><th>#</th><th>Words</th><th>Pts</th><th>Stars</th><th>Time</th><th>Seed</th><th>Date</th></tr></thead>
            <tbody>${buildRows(selDiff, selSize)}</tbody>
          </table>
          </div>
        </div>
      </div>`;

    overlay.querySelectorAll<HTMLElement>('[data-diff]').forEach(el => {
      el.addEventListener('click', () => { selDiff = el.dataset.diff as DifficultyKey; render(); });
    });
    overlay.querySelectorAll<HTMLElement>('[data-size]').forEach(el => {
      el.addEventListener('click', () => { selSize = el.dataset.size as GridSizeKey; render(); });
    });
    overlay.querySelectorAll<HTMLElement>('.hs-seed-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const seed = btn.dataset.seed;
        if (!seed) return;
        void navigator.clipboard?.writeText(seed).catch(() => {});
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1200);
      });
    });
    overlay.querySelector('.def-modal-close')!.addEventListener('click', hideHighScoreModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) hideHighScoreModal(); });
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  onEscape(hideHighScoreModal);
  document.body.appendChild(overlay);
  render();
}

export function hideHighScoreModal(): void { closeModalById(ID); }
