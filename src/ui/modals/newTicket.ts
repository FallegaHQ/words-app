import { createOverlay, openModal, closeModalById, bindClose } from './base';
import { GRID_CONFIGS, DIFFICULTY_PRESETS } from '../../constants';
import type { DifficultyKey, GridSizeKey } from '../../constants';
import type { GameConfig, SeedMode } from '../../types';
import { getDailySeedString, generateRandomSeedString } from '../../core/gameLogic';

const ID = 'nt-modal-overlay';

export interface NewTicketOptions {
  /** Opens with daily seed + no seed display in-game */
  dailyChallenge?: boolean;
  /** Removes close button/backdrop/Escape and adds a Back to Hub button */
  nonDismissable?: boolean;
  /** Called when the user taps Back to Hub (requires nonDismissable) */
  onGoToHub?: () => void;
}

export function showNewTicketModal(
  currentConfig: GameConfig,
  onConfirm: (config: GameConfig) => void,
  options?: NewTicketOptions
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
    `<button type="button" class="nt-diff-pill${o.key === selDiff ? ' active' : ''}" data-key="${o.key}">
       <span class="nt-pill-main">${o.label}</span>
       <span class="nt-pill-sub">${o.sub}</span>
     </button>`
  ).join('');

  const sizePills = sizeOptions.map(o => {
    const c = GRID_CONFIGS[o.key];
    return `<button type="button" class="nt-size-pill${o.key === selSize ? ' active' : ''}" data-key="${o.key}">
      <span class="nt-size-name">${o.label}</span>
      <span class="nt-size-dim">${c.size} × ${c.size}</span>
      <span class="nt-size-words">${c.targetWords} words</span>
    </button>`;
  }).join('');

  const dailyChallengeBanner = options?.dailyChallenge
    ? `<div class="nt-daily-banner">📅 <strong>Daily Challenge</strong> — same ticket for everyone today!</div>`
    : '';

  const overlay = createOverlay(ID, `
    <div class="def-modal nt-modal${options?.dailyChallenge ? ' nt-modal-daily' : ''}" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">${options?.dailyChallenge ? '📅 Daily Challenge' : '🎰 New Ticket'}</span>
        ${options?.nonDismissable ? '' : '<button type="button" class="def-modal-close" aria-label="Close">✕</button>'}
      </div>
      <div class="def-modal-body nt-body">
        ${dailyChallengeBanner}
        <div class="nt-section">
          <div class="nt-label">DIFFICULTY</div>
          <div class="nt-diff-pills">${diffPills}</div>
        </div>
        <div class="nt-section">
          <div class="nt-label">GRID SIZE</div>
          <div class="nt-size-pills">${sizePills}</div>
        </div>
        <div class="nt-section nt-seed-section${options?.dailyChallenge ? ' nt-seed-hidden' : ''}">
          <div class="nt-label">SEED / REPLAY</div>
          <div class="nt-seed-modes">
            <label class="nt-seed-radio"><input type="radio" name="nt-seed" value="random" checked /> Random</label>
            <label class="nt-seed-radio"><input type="radio" name="nt-seed" value="daily" /> Daily (UTC)</label>
            <label class="nt-seed-radio"><input type="radio" name="nt-seed" value="custom" /> Paste / type</label>
          </div>
          <div class="nt-seed-row">
            <input type="text" class="nt-seed-input" id="nt-seed-input" spellcheck="false" autocomplete="off" />
            <button type="button" class="nt-seed-regen" id="nt-seed-regen" title="New random seed">🎲</button>
            <button type="button" class="nt-seed-copy" id="nt-seed-copy" title="Copy">📋</button>
          </div>
          <div class="nt-seed-hint">Same seed + settings = same crossword. Share with friends!</div>
        </div>
        <button type="button" class="btn btn-primary nt-play-btn">🎰 Let's Play!</button>
        ${options?.nonDismissable && options?.onGoToHub ? '<button type="button" class="btn btn-secondary nt-hub-btn">🏠 Back to Hub</button>' : ''}
      </div>
    </div>`);

  const seedInput = overlay.querySelector<HTMLInputElement>('#nt-seed-input')!;

  function syncInputFromMode(mode: SeedMode): void {
    if (mode === 'random') seedInput.value = generateRandomSeedString();
    else if (mode === 'daily') seedInput.value = getDailySeedString();
    // custom: keep whatever the user typed
  }

  function getCheckedSeedMode(): SeedMode {
    const el = overlay.querySelector<HTMLInputElement>('input[name="nt-seed"]:checked');
    return (el?.value as SeedMode) ?? 'random';
  }

  // Initialise seed field from last config (or random)
  {
    let m: SeedMode = currentConfig.seedMode === 'daily_challenge' ? 'daily' : currentConfig.seedMode;
    if (m !== 'random' && m !== 'daily' && m !== 'custom') m = 'random';
    overlay.querySelectorAll<HTMLInputElement>('input[name="nt-seed"]').forEach(r => {
      r.checked = r.value === m;
    });
    if (m === 'custom') seedInput.value = currentConfig.seed || '';
    else syncInputFromMode(m);
  }

  overlay.querySelectorAll<HTMLInputElement>('input[name="nt-seed"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      syncInputFromMode(r.value as SeedMode);
    });
  });

  overlay.querySelector('#nt-seed-regen')!.addEventListener('click', () => {
    seedInput.value = generateRandomSeedString();
    overlay.querySelectorAll<HTMLInputElement>('input[name="nt-seed"]').forEach(r => {
      r.checked = r.value === 'random';
    });
  });

  overlay.querySelector('#nt-seed-copy')!.addEventListener('click', () => {
    void navigator.clipboard?.writeText(seedInput.value).catch(() => {});
  });

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
    if (options?.dailyChallenge) {
      onConfirm({
        difficulty:    DIFFICULTY_PRESETS[selDiff],
        difficultyKey: selDiff,
        gridSizeKey:   selSize,
        seed:          getDailySeedString(),
        seedMode:      'daily_challenge',
      });
      return;
    }

    const mode = getCheckedSeedMode();
    let seed = seedInput.value.trim();
    if (mode === 'random') seed = generateRandomSeedString();
    else if (mode === 'daily') seed = getDailySeedString();
    if (!seed) seed = generateRandomSeedString();

    onConfirm({
      difficulty:    DIFFICULTY_PRESETS[selDiff],
      difficultyKey: selDiff,
      gridSizeKey:   selSize,
      seed,
      seedMode: mode,
    });
  });

  if (options?.nonDismissable) {
    if (options.onGoToHub) {
      overlay.querySelector('.nt-hub-btn')?.addEventListener('click', () => {
        closeModalById(ID);
        options.onGoToHub!();
      });
    }
  } else {
    bindClose(overlay, hideNewTicketModal);
  }
  openModal(overlay);
}

export function hideNewTicketModal(): void { closeModalById(ID); }
