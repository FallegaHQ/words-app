import { GRID_CONFIGS, DIFFICULTY_PRESETS } from './constants';
import type { GridSizeKey, DifficultyKey } from './constants';
import { tileIsUseful } from './gameLogic';
import type { GameState, GameConfig, HighScore } from './types';

// ── Callbacks ────────────────────────────────────────────────────────────────

export interface RenderCallbacks {
  onRevealTile:      (idx: number, isBonus: boolean) => void;
  onScratchCell:     (r: number, c: number) => void;
  onRevealAllHand:   () => void;
  onRevealAllBonus:  () => void;
  onScratchAllAvail: () => void;
  onNewGame:         () => void;
  onWordClick:       (word: string) => void;
  onShowHighScores:  () => void;
}

// ── Ref-based render state ────────────────────────────────────────────────────

interface AppRefs {
  gridSize:        number;
  totalWords:      number;
  cells:           HTMLElement[][];
  handTiles:       HTMLElement[];
  bonusTiles:      HTMLElement[];
  badges:          HTMLElement[];
  hint:            HTMLElement;
  scoreBar:        HTMLElement;
  scratchAvailBtn: HTMLElement;
}

let _refs: AppRefs | null = null;

export function resetRenderer(): void { _refs = null; }

// ── Entry point ───────────────────────────────────────────────────────────────

export function render(state: GameState, cb: RenderCallbacks, config: GameConfig): void {
  const root = document.getElementById('app')!;
  if (!_refs) {
    root.innerHTML = buildInitialHTML(state, config);
    _refs = captureAndBindRefs(root, state, cb, config);
    return;
  }
  applyStateToRefs(_refs, state);
}

// ── Loading / Error ───────────────────────────────────────────────────────────

export function renderLoading(): void {
  resetRenderer();
  document.getElementById('app')!.innerHTML = `
  <div class="ticket screen-card">
    <div class="screen-inner">
      <div class="loading-icon" id="load-icon">🎰</div>
      <div class="loading-title" id="load-title">Generating your ticket…</div>
      <div class="loading-bar-wrap"><div class="loading-bar" id="load-bar" style="width:0%"></div></div>
      <div class="loading-attempt" id="load-attempt">Starting…</div>
    </div>
  </div>`;
}

export function updateLoadingProgress(attempt: number, max: number, done: boolean): void {
  const icon      = document.getElementById('load-icon');
  const title     = document.getElementById('load-title');
  const bar       = document.getElementById('load-bar');
  const attemptEl = document.getElementById('load-attempt');
  if (!icon || !title || !bar || !attemptEl) return;
  if (done) {
    icon.textContent      = '🎉';
    title.textContent     = 'Ticket ready!';
    bar.style.width       = '100%';
    bar.classList.add('bar-done');
    attemptEl.textContent = `Found in ${attempt} attempt${attempt !== 1 ? 's' : ''}`;
  } else {
    bar.style.width       = `${Math.round((attempt / max) * 100)}%`;
    attemptEl.textContent = `Attempt ${attempt} / ${max}`;
  }
}

export function renderError(onRetry: () => void): void {
  resetRenderer();
  document.getElementById('app')!.innerHTML = `
  <div class="ticket screen-card">
    <div class="screen-inner">
      <div class="loading-icon">😬</div>
      <div class="error-title">Couldn't generate a ticket</div>
      <div class="error-body">The word placement ran out of attempts.<br>Give it another shot!</div>
      <button id="btn-retry" class="btn btn-primary error-btn">🔄 Try Again</button>
    </div>
  </div>`;
  document.getElementById('btn-retry')!.addEventListener('click', onRetry);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function setClass(el: HTMLElement, cls: string): void {
  if (el.className !== cls) el.className = cls;
}
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function countAvail(state: GameState): number {
  return state.grid.flat().filter(
    c => c.wordIds.length > 0 && !c.scratched && (c.isWild || state.revealedLetters.has(c.letter))
  ).length;
}

function scoreToStars(words: number, total: number): string {
  const ratio = words / total;
  const n = ratio === 0 ? 0 : ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.6 ? 3 : ratio < 0.85 ? 4 : 5;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// ── Cell / tile class derivation ──────────────────────────────────────────────

function cellClass(r: number, c: number, cell: import('./types').Cell, state: GameState): string {
  if (cell.isWild) {
    const done = cell.wordIds.some(id => state.words.find(w => w.id === id)?.complete);
    if (cell.scratched) {
      const just = state.animatedCells.has(`${r},${c}`);
      return `cell cell-wild scratched${done ? ' word-done' : ''}${just ? ' just-scratched' : ''}`;
    }
    return 'cell cell-wild available';
  }
  if (cell.wordIds.length === 0) return 'cell cell-fill';
  if (cell.scratched) {
    const done = cell.wordIds.some(id => state.words.find(w => w.id === id)?.complete);
    const just = state.animatedCells.has(`${r},${c}`);
    return `cell cell-word scratched${done ? ' word-done' : ''}${just ? ' just-scratched' : ''}`;
  }
  if (state.revealedLetters.has(cell.letter)) {
    const animIn = state.newlyAvailableCells.has(`${r},${c}`);
    return `cell cell-word available${animIn ? ' animate-in' : ''}`;
  }
  return 'cell cell-word locked';
}

function cellContent(cell: import('./types').Cell): string {
  return cell.isWild && !cell.scratched ? '⭐' : cell.letter;
}

function tileClass(tile: import('./types').Tile, isBonus: boolean, state: GameState): string {
  let cls = 'tile';
  if (isBonus) cls += ' bonus-tile';
  if (tile.revealed) {
    cls += ' revealed';
    if (tileIsUseful(tile.letter, state)) cls += ' useful';
  } else {
    cls += ' hidden';
  }
  return cls;
}

// ── Partials ──────────────────────────────────────────────────────────────────

function diffLabel(difficulty: number): string {
  return difficulty <= 0.3 ? '🌴 Easy' : difficulty <= 0.65 ? '⚡ Medium' : '🔥 Hard';
}

function sizeLabel(key: GridSizeKey): string {
  const c = GRID_CONFIGS[key];
  return `${c.size}×${c.size}`;
}

function buildHeader(config: GameConfig): string {
  return `
  <div class="hdr">
    <div class="hdr-title">🏖️ LUCKY LETTERS 🏖️</div>
    <div class="hdr-row">
      <div class="config-badge">
        <span>${diffLabel(config.difficulty)}</span>
        <span class="config-sep">·</span>
        <span>${sizeLabel(config.gridSizeKey)}</span>
      </div>
      <button id="btn-hs" class="btn-hs" title="High Scores">🏆</button>
    </div>
  </div>`;
}

function buildGridHTML(state: GameState): string {
  const N = state.grid.length;
  const cells = state.grid.flatMap((row, r) =>
    row.map((cell, c) =>
      `<div class="${cellClass(r, c, cell, state)}">${cellContent(cell)}</div>`
    )
  ).join('');
  return `<div class="grid" style="grid-template-columns:repeat(${N},1fr)">${cells}</div>`;
}

function buildBadgesHTML(state: GameState): string {
  return `<div class="badges">${
    state.words.map(w =>
      `<div class="badge badge-clickable${w.complete ? ' done' : ''}">${w.text}</div>`
    ).join('')
  }</div>`;
}

function buildBonusHTML(state: GameState): string {
  const tiles = state.bonus.map((t) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, state);
      return `<div class="tile bonus-tile revealed${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile bonus-tile hidden">🎁</div>`;
  }).join('');
  return `
  <div class="bonus-section">
    <div class="section-label">BONUS <span class="sub-hint">(scratch anytime)</span></div>
    <div class="bonus-tiles">${tiles}</div>
  </div>`;
}

function buildHandHTML(state: GameState): string {
  const tiles = state.hand.map((t) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, state);
      return `<div class="tile revealed${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile hidden"></div>`;
  }).join('');
  return `
  <div class="hand-section">
    <div class="section-label">YOUR LETTERS <span class="sub-hint">(scratch to reveal)</span></div>
    <div class="tile-grid">${tiles}</div>
  </div>`;
}

function hintHTML(state: GameState): string {
  const avail = countAvail(state);
  if (avail > 0)
    return `<span class="hint-avail">👆 ${avail} cell${avail !== 1 ? 's' : ''} ready to scratch!</span>`;
  if (state.hand.some(t => !t.revealed))
    return `<span class="hint-idle">Scratch a tile below to reveal letters</span>`;
  return `<span class="hint-idle">Scratch bonus tiles or start a new ticket</span>`;
}

function scoreBarHTML(words: number, total: number): string {
  const stars = scoreToStars(words, total);
  return `<span class="score-count">${words}<span class="score-total"> / ${total}</span></span>
          <span class="score-label">words</span>
          <span class="score-stars">${stars}</span>`;
}

// ── Full initial build ────────────────────────────────────────────────────────

function buildInitialHTML(state: GameState, config: GameConfig): string {
  const total  = GRID_CONFIGS[config.gridSizeKey].targetWords;
  const done   = state.words.filter(w => w.complete).length;
  const avail  = countAvail(state);
  return `
  <div class="ticket">
    ${buildHeader(config)}
    <div class="grid-section">
      ${buildBadgesHTML(state)}
      ${buildGridHTML(state)}
      <div class="grid-hint">${hintHTML(state)}</div>
    </div>
    <div class="bottom-section">
      ${buildBonusHTML(state)}
      ${buildHandHTML(state)}
    </div>
    <div class="score-bar">${scoreBarHTML(done, total)}</div>
    <div class="btn-row">
      <button id="btn-scratch-avail" class="btn btn-secondary"${avail === 0 ? ' style="display:none"' : ''}>🖊 Scratch All Available</button>
      <button id="btn-new-game" class="btn btn-primary">🎰 New Ticket</button>
    </div>
  </div>`;
}

// ── Ref capture + binding ─────────────────────────────────────────────────────

function captureAndBindRefs(
  root: HTMLElement, state: GameState, cb: RenderCallbacks, config: GameConfig
): AppRefs {
  const gridSize   = state.grid.length;
  const totalWords = GRID_CONFIGS[config.gridSizeKey].targetWords;
  const allCellEls = root.querySelectorAll<HTMLElement>('.cell');

  const cells: HTMLElement[][] = [];
  for (let r = 0; r < gridSize; r++) {
    cells[r] = [];
    for (let c = 0; c < gridSize; c++)
      cells[r][c] = allCellEls[r * gridSize + c];
  }

  const handTiles  = Array.from(root.querySelectorAll<HTMLElement>('.hand-section .tile'));
  const bonusTiles = Array.from(root.querySelectorAll<HTMLElement>('.bonus-section .tile'));
  const badges     = Array.from(root.querySelectorAll<HTMLElement>('.badge'));
  const hint       = root.querySelector<HTMLElement>('.grid-hint')!;
  const scoreBar   = root.querySelector<HTMLElement>('.score-bar')!;
  const scratchAvailBtn = root.querySelector<HTMLElement>('#btn-scratch-avail')!;

  // Cells — bind all word/wild cells; game logic validates on action
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) {
      const cell = state.grid[r][c];
      if (cell.wordIds.length > 0 || cell.isWild) {
        const rr = r, cc = c;
        cells[r][c].addEventListener('click', () => cb.onScratchCell(rr, cc));
      }
    }

  handTiles.forEach((el, i) => el.addEventListener('click', () => cb.onRevealTile(i, false)));
  bonusTiles.forEach((el, i) => el.addEventListener('click', () => cb.onRevealTile(i, true)));
  badges.forEach((el, i) => {
    const word = state.words[i].text;
    el.addEventListener('click', () => cb.onWordClick(word));
  });

  scratchAvailBtn.addEventListener('click', cb.onScratchAllAvail);
  root.querySelector('#btn-new-game')!.addEventListener('click', cb.onNewGame);
  root.querySelector('#btn-hs')!.addEventListener('click', cb.onShowHighScores);

  return { gridSize, totalWords, cells, handTiles, bonusTiles, badges, hint, scoreBar, scratchAvailBtn };
}

// ── Targeted DOM update ───────────────────────────────────────────────────────

function applyStateToRefs(refs: AppRefs, state: GameState): void {
  const { gridSize, totalWords, cells, handTiles, bonusTiles, badges, hint, scoreBar, scratchAvailBtn } = refs;

  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) {
      const el = cells[r][c], cell = state.grid[r][c];
      setClass(el, cellClass(r, c, cell, state));
      setText(el, cellContent(cell));
    }

  state.hand.forEach((tile, i) => {
    const el = handTiles[i];
    setClass(el, tileClass(tile, false, state));
    setText(el, tile.revealed ? tile.letter : '');
  });

  state.bonus.forEach((tile, i) => {
    const el = bonusTiles[i];
    setClass(el, tileClass(tile, true, state));
    setText(el, tile.revealed ? tile.letter : '🎁');
  });

  state.words.forEach((word, i) =>
    setClass(badges[i], `badge badge-clickable${word.complete ? ' done' : ''}`)
  );

  hint.innerHTML = hintHTML(state);
  const done = state.words.filter(w => w.complete).length;
  scoreBar.innerHTML = scoreBarHTML(done, totalWords);
  scratchAvailBtn.style.display = countAvail(state) > 0 ? '' : 'none';
}

// ── New-ticket modal ──────────────────────────────────────────────────────────

const NT_MODAL_ID = 'nt-modal-overlay';

export function showNewTicketModal(
  currentConfig: GameConfig,
  onConfirm: (config: GameConfig) => void
): void {
  document.getElementById(NT_MODAL_ID)?.remove();

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

  const overlay = document.createElement('div');
  overlay.id = NT_MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
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
    </div>`;

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
    onConfirm({ difficulty: DIFFICULTY_PRESETS[selDiff], difficultyKey: selDiff, gridSizeKey: selSize });
  });

  const close = () => hideNewTicketModal();
  overlay.querySelector('.def-modal-close')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideNewTicketModal(): void {
  const el = document.getElementById(NT_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ── Definition modal ──────────────────────────────────────────────────────────

const DEF_MODAL_ID = 'def-modal-overlay';

export function showDefinitionModal(word: string, definition: string | null): void {
  document.getElementById(DEF_MODAL_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = DEF_MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
    <div class="def-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">${word}</span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body">
        ${definition === null
          ? `<div class="def-loading"><div class="def-spinner"></div><span>Loading dictionary…</span></div>`
          : `<p class="def-text">${definition}</p>`}
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) hideDefinitionModal(); });
  overlay.querySelector('.def-modal-close')!.addEventListener('click', hideDefinitionModal);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { hideDefinitionModal(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideDefinitionModal(): void {
  const el = document.getElementById(DEF_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ── High-score modal ──────────────────────────────────────────────────────────

const HS_MODAL_ID = 'hs-modal-overlay';

type ScoresMap = Partial<Record<DifficultyKey, Partial<Record<GridSizeKey, HighScore[]>>>>;

export function showHighScoreModal(scores: ScoresMap, currentConfig: GameConfig): void {
  document.getElementById(HS_MODAL_ID)?.remove();

  let selDiff = currentConfig.difficultyKey;
  let selSize = currentConfig.gridSizeKey;

  const diffKeys: DifficultyKey[]   = ['easy', 'medium', 'hard'];
  const sizeKeys: GridSizeKey[]     = ['small', 'normal', 'large'];
  const diffLabels: Record<DifficultyKey, string> = { easy: '🌴 Easy', medium: '⚡ Med', hard: '🔥 Hard' };
  const sizeLabels: Record<GridSizeKey, string>   = { small: 'Small', normal: 'Normal', large: 'Large' };

  function buildRows(d: DifficultyKey, s: GridSizeKey): string {
    const list = scores[d]?.[s] ?? [];
    const top  = [...list].sort((a, b) => b.words - a.words).slice(0, 10);
    if (!top.length)
      return `<tr><td colspan="4" class="hs-empty">No scores yet</td></tr>`;
    return top.map((sc, i) => {
      const d2   = new Date(sc.date);
      const date = d2.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const time = d2.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const stars = scoreToStars(sc.words, sc.total);
      return `<tr class="${i === 0 ? 'hs-top' : ''}">
        <td class="hs-rank">${medal}</td>
        <td class="hs-score">${sc.words}<span class="hs-total"> / ${sc.total}</span></td>
        <td class="hs-stars">${stars}</td>
        <td class="hs-date">${date}<br><span class="hs-time">${time}</span></td>
      </tr>`;
    }).join('');
  }

  function buildFilterBar(): string {
    const diffs = diffKeys.map(k =>
      `<button class="hs-filter-pill${k === selDiff ? ' active' : ''}" data-diff="${k}">${diffLabels[k]}</button>`
    ).join('');
    const sizes = sizeKeys.map(k =>
      `<button class="hs-filter-pill${k === selSize ? ' active' : ''}" data-size="${k}">${sizeLabels[k]}</button>`
    ).join('');
    return `<div class="hs-filters">
      <div class="hs-filter-row">${diffs}</div>
      <div class="hs-filter-row">${sizes}</div>
    </div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = HS_MODAL_ID;
  overlay.className = 'def-modal-overlay';

  function render() {
    const cfg = GRID_CONFIGS[selSize];
    overlay.innerHTML = `
      <div class="def-modal hs-modal" role="dialog" aria-modal="true">
        <div class="def-modal-header">
          <span class="def-modal-word">🏆 High Scores</span>
          <button class="def-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="def-modal-body hs-body">
          ${buildFilterBar()}
          <div class="hs-context">${diffLabels[selDiff]} · ${cfg.size}×${cfg.size} · ${cfg.targetWords} words</div>
          <table class="hs-table">
            <thead><tr><th>#</th><th>Score</th><th>Stars</th><th>Date</th></tr></thead>
            <tbody>${buildRows(selDiff, selSize)}</tbody>
          </table>
        </div>
      </div>`;

    overlay.querySelectorAll<HTMLElement>('[data-diff]').forEach(el => {
      el.addEventListener('click', () => { selDiff = el.dataset.diff as DifficultyKey; render(); });
    });
    overlay.querySelectorAll<HTMLElement>('[data-size]').forEach(el => {
      el.addEventListener('click', () => { selSize = el.dataset.size as GridSizeKey; render(); });
    });
    overlay.querySelector('.def-modal-close')!.addEventListener('click', () => hideHighScoreModal());
    overlay.addEventListener('click', e => { if (e.target === overlay) hideHighScoreModal(); });
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { hideHighScoreModal(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  render();
}

export function hideHighScoreModal(): void {
  const el = document.getElementById(HS_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}
