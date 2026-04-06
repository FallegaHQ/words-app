import { GRID_CONFIGS, DIFFICULTY_PRESETS, LETTER_SCORES, ACHIEVEMENTS } from './constants';
import type { GridSizeKey, DifficultyKey } from './constants';
import { tileIsUseful, computeScore, computeWordScore } from './gameLogic';
import type { GameState, GameConfig, HighScore } from './types';

// ── Callbacks ────────────────────────────────────────────────────────────────

export interface RenderCallbacks {
  onRevealTile:       (idx: number, isBonus: boolean) => void;
  onScratchCell:      (r: number, c: number) => void;
  onLuckyDrawPick:    (letter: string) => void;
  onNewGame:          () => void;
  onWordClick:        (word: string, onDefinitionClosed: () => void) => void;
  onShowHighScores:   () => void;
  onShowAchievements: () => void;
}

// ── Ref-based render state ────────────────────────────────────────────────────

interface AppRefs {
  gridSize:            number;
  totalWords:          number;
  cells:               HTMLElement[][];
  allTiles:            HTMLElement[];       // hand+bonus combined
  allTilesCount:       number;
  hint:                HTMLElement;
  scoreBar:            HTMLElement;
  wordsBtn:            HTMLElement;
  handPanel:           HTMLElement;
  luckyPanel:          HTMLElement;
  luckyTilesEl:        HTMLElement;
  luckyDrawRendered:   boolean;
  state:               GameState;           // kept for lucky draw re-render
  cb:                  RenderCallbacks;
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
  _refs.state = state;
  applyStateToRefs(_refs, state, cb);
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

function isFogged(r: number, c: number, cell: import('./types').Cell, state: GameState): boolean {
  if (cell.wordIds.length === 0) return false;
  if (cell.isWild) return false;   // wild cells always visible
  if (cell.scratched) return false;
  return !state.fogRevealed.has(`${r},${c}`);
}

function cellClass(r: number, c: number, cell: import('./types').Cell, state: GameState): string {
  const multCls = cell.multiplier === 3 ? ' cell-triple' : cell.multiplier === 2 ? ' cell-double' : '';
  if (cell.isWild) {
    const done = cell.wordIds.some(id => state.words.find(w => w.id === id)?.complete);
    if (cell.scratched) {
      const just = state.animatedCells.has(`${r},${c}`);
      return `cell cell-wild scratched${done ? ' word-done' : ''}${just ? ' just-scratched' : ''}`;
    }
    return 'cell cell-wild available';
  }
  if (cell.wordIds.length === 0) return 'cell cell-fill';

  // Fog check
  if (isFogged(r, c, cell, state)) return `cell cell-word fog${multCls}`;

  if (cell.scratched) {
    const done = cell.wordIds.some(id => state.words.find(w => w.id === id)?.complete);
    const just = state.animatedCells.has(`${r},${c}`);
    return `cell cell-word scratched${done ? ' word-done' : ''}${just ? ' just-scratched' : ''}${multCls}`;
  }
  if (state.revealedLetters.has(cell.letter)) {
    const animIn = state.newlyAvailableCells.has(`${r},${c}`);
    return `cell cell-word available${animIn ? ' animate-in' : ''}${multCls}`;
  }
  return `cell cell-word locked${multCls}`;
}

function cellContent(r: number, c: number, cell: import('./types').Cell, state: GameState): string {
  if (isFogged(r, c, cell, state)) return '';
  return cell.isWild && !cell.scratched ? '⭐' : cell.letter;
}

function tileClass(tile: import('./types').Tile, isBonus: boolean, state: GameState): string {
  let cls = 'tile';
  if (isBonus) cls += ' bonus-tile';
  if (tile.revealed) {
    cls += ' revealed scratched-look';
    if (tileIsUseful(tile.letter, state)) cls += ' useful';
  } else {
    cls += ' hidden';
  }
  return cls;
}

// ── Partials ──────────────────────────────────────────────────────────────────

export function diffLabel(difficulty: number): string {
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
      <div class="hdr-btns">
        <button id="btn-words" class="btn-icon" title="Words List">📋 <span id="words-count-badge">0</span></button>
        <button id="btn-ach" class="btn-icon" title="Achievements">🏅</button>
        <button id="btn-hs" class="btn-hs" title="High Scores">🏆</button>
      </div>
    </div>
  </div>`;
}

function buildGridHTML(state: GameState): string {
  const N = state.grid.length;
  const cells = state.grid.flatMap((row, r) =>
    row.map((cell, c) => {
      const multAttr = cell.multiplier ? ` data-mult="${cell.multiplier}×"` : '';
      const score = (!cell.isWild && cell.wordIds.length > 0)
        ? ` data-lscore="${LETTER_SCORES[cell.letter] ?? 1}"`
        : '';
      const fogged = isFogged(r, c, cell, state);
      const content = fogged ? '' : cellContent(r, c, cell, state);
      return `<div class="${cellClass(r, c, cell, state)}"${multAttr}${score}>${content}</div>`;
    })
  ).join('');
  return `<div class="grid" style="grid-template-columns:repeat(${N},1fr)">${cells}</div>`;
}

function smartTilesPerRow(total: number): number {
  for (let n = 8; n >= 4; n--) if (total % n === 0) return n;
  // Minimize orphaned tiles (prefer rows that leave fewest incomplete)
  let best = 5, bestOrphans = Infinity;
  for (let n = 4; n <= 8; n++) {
    const orphans = total % n === 0 ? 0 : n - (total % n);
    if (orphans < bestOrphans || (orphans === bestOrphans && n > best)) {
      bestOrphans = orphans; best = n;
    }
  }
  return best;
}

function buildCombinedHandHTML(state: GameState): string {
  const totalTiles = state.hand.length + state.bonus.length;
  const perRow = smartTilesPerRow(totalTiles);

  const handTiles = state.hand.map((t) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, state);
      return `<div class="tile revealed scratched-look${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile hidden"></div>`;
  }).join('');

  const bonusTiles = state.bonus.map((t) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, state);
      return `<div class="tile bonus-tile revealed scratched-look${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile bonus-tile hidden">🎁</div>`;
  }).join('');

  return `
  <div class="hand-panel" id="hand-panel">
    <div class="section-label">YOUR TILES <span class="sub-hint">(scratch to reveal · 🎁 bonus anytime)</span></div>
    <div class="tile-grid" style="grid-template-columns:repeat(${perRow},1fr)">${handTiles}${bonusTiles}</div>
  </div>`;
}

function buildLuckyDrawHTML(state: GameState): string {
  const allRevealed = state.hand.every(t => t.revealed) && state.bonus.every(t => t.revealed);
  const show = allRevealed && !state.luckyDrawUsed && state.luckyDrawPool.length > 0;
  return `
  <div class="lucky-panel${show ? '' : ' hidden-panel'}" id="lucky-panel">
    <div class="section-label">🍀 LUCKY DRAW <span class="sub-hint">(once per game — pick one letter)</span></div>
    <div class="lucky-tiles" id="lucky-tiles">
      ${show ? buildLuckyTilesHTML(state.luckyDrawPool) : ''}
    </div>
  </div>`;
}

function buildLuckyTilesHTML(pool: string[]): string {
  return pool.map(l =>
    `<div class="tile lucky-tile hidden" data-lucky="${l}">${l}</div>`
  ).join('');
}

function hintHTML(state: GameState): string {
  const avail = countAvail(state);
  if (avail > 0)
    return `<span class="hint-avail">👆 ${avail} cell${avail !== 1 ? 's' : ''} ready to scratch!</span>`;
  if (state.hand.some(t => !t.revealed) || state.bonus.some(t => !t.revealed))
    return `<span class="hint-idle">Scratch a tile below to reveal letters</span>`;
  return `<span class="hint-idle">All tiles revealed — start a new ticket!</span>`;
}

function scoreBarHTML(words: number, total: number, score: number): string {
  const stars = scoreToStars(words, total);
  const pts   = score > 0 ? `<span class="score-sep">·</span><span class="score-pts">${score.toLocaleString()}</span><span class="score-label">pts</span>` : '';
  return `<span class="score-count">${words}<span class="score-total"> / ${total}</span></span>
          <span class="score-label">words</span>
          ${pts}
          <span class="score-stars">${stars}</span>`;
}

// ── Full initial build ────────────────────────────────────────────────────────

function buildInitialHTML(state: GameState, config: GameConfig): string {
  const total = GRID_CONFIGS[config.gridSizeKey].targetWords;
  const done  = state.words.filter(w => w.complete).length;
  const score = computeScore(state);
  return `
  <div class="ticket">
    ${buildHeader(config)}
    <div class="grid-section">
      ${buildGridHTML(state)}
      <div class="grid-hint">${hintHTML(state)}</div>
    </div>
    <div class="bottom-section">
      ${buildCombinedHandHTML(state)}
      ${buildLuckyDrawHTML(state)}
    </div>
    <div class="score-bar">${scoreBarHTML(done, total, score)}</div>
    <div class="btn-row">
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

  const allTiles = Array.from(root.querySelectorAll<HTMLElement>('.hand-panel .tile'));
  const hint       = root.querySelector<HTMLElement>('.grid-hint')!;
  const scoreBar   = root.querySelector<HTMLElement>('.score-bar')!;
  const wordsBtn   = root.querySelector<HTMLElement>('#btn-words')!;
  const handPanel  = root.querySelector<HTMLElement>('#hand-panel')!;
  const luckyPanel = root.querySelector<HTMLElement>('#lucky-panel')!;
  const luckyTilesEl = root.querySelector<HTMLElement>('#lucky-tiles')!;

  // Cells
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) {
      const cell = state.grid[r][c];
      if (cell.wordIds.length > 0 || cell.isWild) {
        const rr = r, cc = c;
        cells[r][c].addEventListener('click', () => cb.onScratchCell(rr, cc));
      }
    }

  // Hand + bonus tiles
  allTiles.forEach((el, i) => {
    const isBonus = i >= state.hand.length;
    const idx = isBonus ? i - state.hand.length : i;
    el.addEventListener('click', () => cb.onRevealTile(idx, isBonus));
  });

  // Words button
  wordsBtn.addEventListener('click', () => {
    if (!_refs) return;
    showWordsModal(_refs.state, cb);
  });

  // Update words count badge immediately
  const countBadge = root.querySelector<HTMLElement>('#words-count-badge');
  if (countBadge) countBadge.textContent = `${state.words.filter(w=>w.complete).length}/${totalWords}`;

  root.querySelector('#btn-new-game')!.addEventListener('click', cb.onNewGame);
  root.querySelector('#btn-hs')!.addEventListener('click', cb.onShowHighScores);
  root.querySelector('#btn-ach')!.addEventListener('click', cb.onShowAchievements);

  const refs: AppRefs = {
    gridSize, totalWords, cells,
    allTiles, allTilesCount: allTiles.length,
    hint, scoreBar, wordsBtn,
    handPanel, luckyPanel, luckyTilesEl,
    luckyDrawRendered: false,
    state, cb,
  };

  // Bind lucky draw tiles if already visible
  bindLuckyDrawTiles(refs, state, cb);

  return refs;
}

function bindLuckyDrawTiles(refs: AppRefs, state: GameState, cb: RenderCallbacks): void {
  const allRevealed = state.hand.every(t => t.revealed) && state.bonus.every(t => t.revealed);
  if (!allRevealed || state.luckyDrawUsed || state.luckyDrawPool.length === 0) return;

  if (!refs.luckyDrawRendered) {
    refs.luckyTilesEl.innerHTML = buildLuckyTilesHTML(state.luckyDrawPool);
    refs.luckyDrawRendered = true;
  }

  refs.luckyTilesEl.querySelectorAll<HTMLElement>('[data-lucky]').forEach(el => {
    // Remove old listeners by cloning
    const clone = el.cloneNode(true) as HTMLElement;
    el.parentNode?.replaceChild(clone, el);
    clone.addEventListener('click', () => cb.onLuckyDrawPick(clone.dataset.lucky!));
  });
}

// ── Targeted DOM update ───────────────────────────────────────────────────────

function applyStateToRefs(refs: AppRefs, state: GameState, cb: RenderCallbacks): void {
  const { gridSize, totalWords, cells, allTiles, hint, scoreBar, handPanel, luckyPanel } = refs;

  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) {
      const el = cells[r][c], cell = state.grid[r][c];
      const cls = cellClass(r, c, cell, state);
      if (el.className !== cls) el.className = cls;
      const content = cellContent(r, c, cell, state);
      if (el.textContent !== content) el.textContent = content;
      const multStr = cell.multiplier ? `${cell.multiplier}×` : '';
      if (el.dataset.mult !== multStr) el.dataset.mult = multStr;
      const lscore = (!cell.isWild && cell.wordIds.length > 0) ? String(LETTER_SCORES[cell.letter] ?? 1) : '';
      if (el.dataset.lscore !== lscore) el.dataset.lscore = lscore;
    }

  // Patch tiles
  allTiles.forEach((el, i) => {
    const isBonus = i >= state.hand.length;
    const idx = isBonus ? i - state.hand.length : i;
    const tile = isBonus ? state.bonus[idx] : state.hand[idx];
    if (!tile) return;
    setClass(el, tileClass(tile, isBonus, state));
    setText(el, tile.revealed ? tile.letter : (isBonus ? '🎁' : ''));
  });

  hint.innerHTML = hintHTML(state);
  const done  = state.words.filter(w => w.complete).length;
  const score = computeScore(state);
  scoreBar.innerHTML = scoreBarHTML(done, totalWords, score);

  // Update words count badge
  const countBadge = document.getElementById('words-count-badge');
  if (countBadge) countBadge.textContent = `${done}/${totalWords}`;

  // Lucky draw visibility
  const allRevealed = state.hand.every(t => t.revealed) && state.bonus.every(t => t.revealed);
  const showLucky   = allRevealed && !state.luckyDrawUsed && state.luckyDrawPool.length > 0;

  if (showLucky) {
    handPanel.classList.add('hidden-panel');
    luckyPanel.classList.remove('hidden-panel');
    bindLuckyDrawTiles(refs, state, cb);
  } else if (state.luckyDrawUsed) {
    // After using lucky draw, show hand again
    handPanel.classList.remove('hidden-panel');
    luckyPanel.classList.add('hidden-panel');
  } else {
    handPanel.classList.remove('hidden-panel');
    luckyPanel.classList.add('hidden-panel');
  }
}

// ── Words list modal ──────────────────────────────────────────────────────────

const WORDS_MODAL_ID = 'words-modal-overlay';

export function showWordsModal(state: GameState, cb: RenderCallbacks): void {
  document.getElementById(WORDS_MODAL_ID)?.remove();
  const done  = state.words.filter(w => w.complete).length;
  const total = state.words.length;

  const badgesHTML = state.words.map(w =>
    `<div class="badge badge-clickable${w.complete ? ' done' : ''}" data-word="${w.text}">${w.text}</div>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = WORDS_MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
    <div class="def-modal words-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">📋 Words <span style="font-size:13px;opacity:.8">${done}/${total}</span></span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body words-modal-body">
        <div class="words-modal-badges">${badgesHTML}</div>
        <div class="words-modal-hint">Tap a word to look it up</div>
      </div>
    </div>`;

  overlay.querySelectorAll<HTMLElement>('[data-word]').forEach(el => {
    el.addEventListener('click', () => {
      hideWordsModal();
      cb.onWordClick(el.dataset.word!, () => showWordsModal(state, cb));
    });
  });

  const close = () => hideWordsModal();
  overlay.querySelector('.def-modal-close')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideWordsModal(): void {
  const el = document.getElementById(WORDS_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
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

export function showDefinitionModal(word: string, definition: string | null, onClose?: () => void): void {
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

  const doClose = () => { hideDefinitionModal(); onClose?.(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });
  overlay.querySelector('.def-modal-close')!.addEventListener('click', doClose);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { doClose(); document.removeEventListener('keydown', onKey); }
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

  function renderHS() {
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
      el.addEventListener('click', () => { selDiff = el.dataset.diff as DifficultyKey; renderHS(); });
    });
    overlay.querySelectorAll<HTMLElement>('[data-size]').forEach(el => {
      el.addEventListener('click', () => { selSize = el.dataset.size as GridSizeKey; renderHS(); });
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
  renderHS();
}

export function hideHighScoreModal(): void {
  const el = document.getElementById(HS_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ── Achievements modal ────────────────────────────────────────────────────────

const ACH_MODAL_ID = 'ach-modal-overlay';

export function showAchievementsModal(unlockedIds: Set<string>): void {
  document.getElementById(ACH_MODAL_ID)?.remove();

  const rows = ACHIEVEMENTS.map(a => {
    const unlocked = unlockedIds.has(a.id);
    return `<div class="ach-row${unlocked ? ' ach-unlocked' : ' ach-locked'}">
      <span class="ach-icon">${unlocked ? a.icon : '🔒'}</span>
      <div class="ach-info">
        <div class="ach-title">${unlocked ? a.title : '???'}</div>
        <div class="ach-desc">${unlocked ? a.description : 'Keep playing to unlock'}</div>
      </div>
      ${unlocked ? '<span class="ach-check">✓</span>' : ''}
    </div>`;
  }).join('');

  const total    = ACHIEVEMENTS.length;
  const achieved = unlockedIds.size;

  const overlay = document.createElement('div');
  overlay.id = ACH_MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
    <div class="def-modal ach-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">🏅 Achievements <span style="font-size:13px;opacity:.8">${achieved}/${total}</span></span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body ach-body">
        <div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${Math.round(achieved/total*100)}%"></div></div>
        <div class="ach-list">${rows}</div>
      </div>
    </div>`;

  const close = () => hideAchievementsModal();
  overlay.querySelector('.def-modal-close')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideAchievementsModal(): void {
  const el = document.getElementById(ACH_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ── Achievement toast ─────────────────────────────────────────────────────────

export function showAchievementToast(icon: string, title: string): void {
  const toast = document.createElement('div');
  toast.className = 'ach-toast';
  toast.innerHTML = `<span class="ach-toast-icon">${icon}</span>
    <div class="ach-toast-text">
      <div class="ach-toast-label">Achievement Unlocked!</div>
      <div class="ach-toast-title">${title}</div>
    </div>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('ach-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('ach-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

// ── Summary modal ─────────────────────────────────────────────────────────────

const SUM_MODAL_ID = 'sum-modal-overlay';

export interface SummaryCallbacks {
  onPlayAgain?:      () => void;
  onChangeSettings?: () => void;
  onStart?:          () => void;
}

function formatDuration(ms: number): string {
  const s   = Math.floor(ms / 1000);
  const m   = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function showSummaryModal(
  state:     GameState,
  config:    GameConfig,
  elapsedMs: number,
  cb:        SummaryCallbacks
): void {
  document.getElementById(SUM_MODAL_ID)?.remove();

  const cfg         = GRID_CONFIGS[config.gridSizeKey];
  const doneWords   = state.words.filter(w => w.complete);
  const totalWords  = cfg.targetWords;
  const score       = computeScore(state);
  const stars       = scoreToStars(doneWords.length, totalWords);
  const allDone     = doneWords.length === totalWords;
  const dLbl        = diffLabel(config.difficulty);
  const sizeLbl     = sizeLabel(config.gridSizeKey);
  const timeStr     = elapsedMs > 0 ? formatDuration(elapsedMs) : '—';

  const wordRows = doneWords
    .map(w => ({ word: w, pts: computeWordScore(w, state.grid) }))
    .sort((a, b) => b.pts - a.pts)
    .map(({ word, pts }) => {
      const hasDouble = word.cells.some(([r, c]) => state.grid[r][c].multiplier === 2);
      const hasTriple = word.cells.some(([r, c]) => state.grid[r][c].multiplier === 3);
      const tag = hasTriple
        ? '<span class="sum-mult-tag sum-triple">3×</span>'
        : hasDouble
          ? '<span class="sum-mult-tag sum-double">2×</span>'
          : '';
      return `<div class="sum-word-row">
        <span class="sum-word-text">${word.text}${tag}</span>
        <span class="sum-word-pts">${pts}<span class="sum-word-pts-label"> pts</span></span>
      </div>`;
    }).join('');

  const incompleteCount = state.words.length - doneWords.length;
  const incompleteNote  = incompleteCount > 0
    ? `<div class="sum-incomplete">${incompleteCount} word${incompleteCount !== 1 ? 's' : ''} left on the board</div>`
    : '';

  const isSingleMode = !!cb.onStart;
  const actionsHTML  = isSingleMode
    ? `<button class="btn btn-primary sum-btn-start">🎰 Let's Play!</button>`
    : `<button class="btn btn-secondary sum-btn-settings">⚙️ Change Settings</button>
       <button class="btn btn-primary sum-btn-again">🎰 Play Again</button>`;

  const overlay = document.createElement('div');
  overlay.id        = SUM_MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
    <div class="def-modal sum-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">${allDone ? '🎉 Ticket Complete!' : doneWords.length > 0 ? '🎰 Game Summary' : '🎰 No Words Found'}</span>
        ${isSingleMode ? '' : '<button class="def-modal-close" aria-label="Close">✕</button>'}
      </div>
      <div class="def-modal-body sum-body">
        <div class="sum-hero">
          <div class="sum-stars">${stars}</div>
          <div class="sum-score">${score.toLocaleString()}<span class="sum-score-label"> pts</span></div>
          <div class="sum-meta">
            <span class="sum-meta-item">📝 ${doneWords.length} / ${totalWords} words</span>
            <span class="sum-meta-sep">·</span>
            <span class="sum-meta-item">${dLbl}</span>
            <span class="sum-meta-sep">·</span>
            <span class="sum-meta-item">🔲 ${sizeLbl}</span>
            <span class="sum-meta-sep">·</span>
            <span class="sum-meta-item">⏱ ${timeStr}</span>
          </div>
        </div>
        ${doneWords.length > 0 ? `
        <div class="sum-words-section">
          <div class="sum-words-label">COMPLETED WORDS</div>
          <div class="sum-words-list">${wordRows}</div>
          ${incompleteNote}
        </div>` : `<div class="sum-no-words">No words completed this time — keep exploring the fog!</div>`}
        <div class="sum-actions">${actionsHTML}</div>
      </div>
    </div>`;

  if (isSingleMode) {
    const start = cb.onStart!;
    overlay.querySelector('.sum-btn-start')!.addEventListener('click', start);
    overlay.addEventListener('click', e => { if (e.target === overlay) start(); });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); start(); }
    };
    document.addEventListener('keydown', onKey);
  } else {
    overlay.querySelector('.sum-btn-again')!.addEventListener('click', cb.onPlayAgain!);
    overlay.querySelector('.sum-btn-settings')!.addEventListener('click', cb.onChangeSettings!);
    overlay.querySelector('.def-modal-close')!.addEventListener('click', () => hideSummaryModal());
    overlay.addEventListener('click', e => { if (e.target === overlay) hideSummaryModal(); });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { hideSummaryModal(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideSummaryModal(): void {
  const el = document.getElementById(SUM_MODAL_ID);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}
