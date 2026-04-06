import { createOverlay, openModal, closeModalById, bindClose } from './base';
import { GRID_CONFIGS, DIFFICULTY_PRESETS } from '../../constants';
import type { DifficultyKey, GridSizeKey } from '../../constants';
import type { GameConfig } from '../../types';

const ID = 'nt-modal-overlay';

export function showNewTicketModal(
  currentConfig: GameConfig,
  onConfirm: (config: GameConfig) => void
): void {
  let selDiff = currentConfig.difficultyKey;
  let selSize = currentConfig.gridSizeKey;

  const diffOptions: { key: DifficultyKey; label: string; sub: string }[] = [
    { key: 'easy',   label: '🌴 Easy',   sub: 'More useful tiles' },
    { key: 'medium', label: '⚡ Medium', sub: 'Balanced challenge' },
    { key: 'hard',   label: '🔥 Hard',   sub: 'Rough letters' },
  ];
  const sizeOptions: { key: GridSizeKey; label: string }[] = [
    { key: 'small',  label: 'Small'  },
    { key: 'normal', label: 'Normal' },
    { key: 'large',  label: 'Large'  },
  ];

  const diffPills = diffOptions.map(o =>
    `<button class="nt-diff-pill${o.key === selDiff ? ' active' : ''}" data-key="${o.key}">
       <span class="nt-pill-main">${o.label}</span>
       <span class="nt-pill-sub">${o.sub}</span>
     </button>`
  ).join('');

  const sizePills = sizeOptions.map(o => {
    const c = GRID_CONFIGS[o.key];
    return `<button class="nt-size-pill${o.key === selSize ? ' active' : ''}" data-key="${o.key}">
      <span class="nt-size-name">${o.label}</span>
      <span class="nt-size-dim">${c.size} × ${c.size}</span>
      <span class="nt-size-words">${c.targetWords} words</span>
    </button>`;
  }).join('');

  const overlay = createOverlay(ID, `
    <div class="def-modal nt-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">🎰 New Ticket</span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body nt-body">
        <div class="nt-section">
          <div class="nt-label">DIFFICULTY</div>
          <div class="nt-diff-pills">${diffPills}</div>
        </div>
        <div class="nt-section">
          <div class="nt-label">GRID SIZE</div>
          <div class="nt-size-pills">${sizePills}</div>
        </div>
        <button class="btn btn-primary nt-play-btn">🎰 Let's Play!</button>
      </div>
    </div>`);

  overlay.querySelectorAll<HTMLElement>('.nt-diff-pill').forEach(el => {
    el.addEventListener('click', () => {
      selDiff = el.dataset.key as DifficultyKey;
      overlay.querySelectorAll('.nt-diff-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
    });
  });

  overlay.querySelectorAll<HTMLElement>('.nt-size-pill').forEach(el => {
    el.addEventListener('click', () => {
      selSize = el.dataset.key as GridSizeKey;
      overlay.querySelectorAll('.nt-size-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
    });
  });

  overlay.querySelector('.nt-play-btn')!.addEventListener('click', () => {
    onConfirm({
      difficulty:    DIFFICULTY_PRESETS[selDiff],
      difficultyKey: selDiff,
      gridSizeKey:   selSize,
    });
  });

  bindClose(overlay, hideNewTicketModal);
  openModal(overlay);
}

export function hideNewTicketModal(): void { closeModalById(ID); }
