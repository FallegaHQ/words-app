import { createOverlay, closeModalById, onEscape } from './base';
import { DIFFICULTY_PRESETS } from '../../constants';
import type { GameHistoryEntry } from '../../types';
import { diffLabel, sizeLabel, scoreToStars, formatDuration } from '../utils';
import { playSFX } from '../sfx';

const ID = 'history-modal-overlay';

export interface HistoryCallbacks {
  onReplay: (entry: GameHistoryEntry) => void;
}

export function showHistoryModal(history: GameHistoryEntry[], cb: HistoryCallbacks): void {
  const overlay = createOverlay(ID, '');

  function render() {
    const rows = history.length === 0
      ? `<div class="hist-empty">No games played yet. Go start one! 🎰</div>`
      : history.map((entry, i) => {
          const d   = new Date(entry.date);
          const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          const stars   = scoreToStars(entry.words, entry.total);
          const dur     = entry.elapsedMs > 0 ? formatDuration(entry.elapsedMs) : '—';
          const dLbl    = diffLabel(DIFFICULTY_PRESETS[entry.difficultyKey]);
          const sLbl    = sizeLabel(entry.gridSizeKey);
          const seedModeIcon = entry.seedMode === 'daily_challenge' ? '📅' : '🎰';
          return `
          <div class="hist-row" data-idx="${i}">
            <div class="hist-row-top">
              <span class="hist-date">${dateStr} <span class="hist-time">${timeStr}</span></span>
              <span class="hist-cfg">${dLbl} · ${sLbl}</span>
              <span class="hist-stars">${stars}</span>
            </div>
            <div class="hist-row-bottom">
              <span class="hist-score">${entry.words}/${entry.total} words · ${entry.score.toLocaleString()} pts · ⏱${dur}</span>
              <span class="hist-seed-wrap">
                ${seedModeIcon}
                <span class="hist-seed-text" title="${entry.seed}">${entry.seed.length > 16 ? entry.seed.slice(0, 14) + '…' : entry.seed}</span>
                <button class="hist-btn hist-copy-btn" data-copy="${i}" title="Copy seed">📋</button>
                <button class="hist-btn hist-replay-btn" data-replay="${i}" title="Replay this game">🔁</button>
              </span>
            </div>
          </div>`;
        }).join('');

    overlay.innerHTML = `
      <div class="def-modal hist-modal" role="dialog" aria-modal="true">
        <div class="def-modal-header">
          <span class="def-modal-word">📜 Game History</span>
          <button class="def-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="def-modal-body hist-body">
          ${history.length > 0 ? `<div class="hist-count">${history.length} game${history.length !== 1 ? 's' : ''} on record (last 200)</div>` : ''}
          <div class="hist-list">${rows}</div>
        </div>
      </div>`;

    overlay.querySelector('.def-modal-close')!.addEventListener('click', hideHistoryModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) hideHistoryModal(); });

    overlay.querySelectorAll<HTMLElement>('.hist-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.copy ?? '0', 10);
        const entry = history[idx];
        if (!entry) return;
        void navigator.clipboard?.writeText(entry.seed).catch(() => {});
        playSFX('draft_pick');
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1200);
      });
    });

    overlay.querySelectorAll<HTMLElement>('.hist-replay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.replay ?? '0', 10);
        const entry = history[idx];
        if (!entry) return;
        hideHistoryModal();
        cb.onReplay(entry);
      });
    });

    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  onEscape(hideHistoryModal);
  render();
}

export function hideHistoryModal(): void { closeModalById(ID); }
