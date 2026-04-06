import { GRID_CONFIGS, LETTER_SCORES } from '../constants';
import { tileIsUseful, computeScore } from '../core/gameLogic';
import type { GameState, GameConfig, RenderCallbacks } from '../types';
import type { Cell } from '../types';
import { diffLabel, sizeLabel, scoreToStars } from './utils';
import { showWordsModal } from './modals/words';

// ── Ref-based render state ────────────────────────────────────────────────────

interface AppRefs {
  gridSize:          number;
  totalWords:        number;
  cells:             HTMLElement[][];
  allTiles:          HTMLElement[];
  hint:              HTMLElement;
  scoreBar:          HTMLElement;
  wordsBtn:          HTMLElement;
  handPanel:         HTMLElement;
  luckyPanel:        HTMLElement;
  luckyTilesEl:      HTMLElement;
  luckyDrawRendered: boolean;
  state:             GameState;
  cb:                RenderCallbacks;
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

// ── Cell / tile class derivation ──────────────────────────────────────────────

function isFogged(r: number, c: number, cell: Cell, state: GameState): boolean {
  if (cell.wordIds.length === 0) return false;
  if (cell.isWild)               return false;
  if (cell.scratched)            return false;
  return !state.fogRevealed.has(`${r},${c}`);
}

function cellClass(r: number, c: number, cell: Cell, state: GameState): string {
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

function cellContent(r: number, c: number, cell: Cell, state: GameState): string {
  if (isFogged(r, c, cell, state)) return '';
  return cell.isWild && !cell.scratched ? '⭐' : cell.letter;
}

function tileClass(tile: import('../types').Tile, isBonus: boolean, state: GameState): string {
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
        <button id="btn-ach"   class="btn-icon" title="Achievements">🏅</button>
        <button id="btn-hs"    class="btn-hs"   title="High Scores">🏆</button>
      </div>
    </div>
  </div>`;
}

function buildGridHTML(state: GameState): string {
  const N = state.grid.length;
  const cells = state.grid.flatMap((row, r) =>
    row.map((cell, c) => {
      const multAttr = cell.multiplier ? ` data-mult="${cell.multiplier}×"` : '';
      const score    = (!cell.isWild && cell.wordIds.length > 0)
        ? ` data-lscore="${LETTER_SCORES[cell.letter] ?? 1}"`
        : '';
      const content = isFogged(r, c, cell, state) ? '' : cellContent(r, c, cell, state);
      return `<div class="${cellClass(r, c, cell, state)}"${multAttr}${score}>${content}</div>`;
    })
  ).join('');
  return `<div class="grid" style="grid-template-columns:repeat(${N},1fr)">${cells}</div>`;
}

function smartTilesPerRow(total: number): number {
  for (let n = 8; n >= 4; n--) if (total % n === 0) return n;
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
  const perRow     = smartTilesPerRow(totalTiles);

  const handTiles = state.hand.map(t => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, state);
      return `<div class="tile revealed scratched-look${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile hidden"></div>`;
  }).join('');

  const bonusTiles = state.bonus.map(t => {
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
  const pts   = score > 0
    ? `<span class="score-sep">·</span><span class="score-pts">${score.toLocaleString()}</span><span class="score-label">pts</span>`
    : '';
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

  const allTiles    = Array.from(root.querySelectorAll<HTMLElement>('.hand-panel .tile'));
  const hint        = root.querySelector<HTMLElement>('.grid-hint')!;
  const scoreBar    = root.querySelector<HTMLElement>('.score-bar')!;
  const wordsBtn    = root.querySelector<HTMLElement>('#btn-words')!;
  const handPanel   = root.querySelector<HTMLElement>('#hand-panel')!;
  const luckyPanel  = root.querySelector<HTMLElement>('#lucky-panel')!;
  const luckyTilesEl = root.querySelector<HTMLElement>('#lucky-tiles')!;

  // Cell listeners
  for (let r = 0; r < gridSize; r++)
    for (let c = 0; c < gridSize; c++) {
      const cell = state.grid[r][c];
      if (cell.wordIds.length > 0 || cell.isWild) {
        const rr = r, cc = c;
        cells[r][c].addEventListener('click', () => cb.onScratchCell(rr, cc));
      }
    }

  // Tile listeners
  allTiles.forEach((el, i) => {
    const isBonus = i >= state.hand.length;
    const idx     = isBonus ? i - state.hand.length : i;
    el.addEventListener('click', () => cb.onRevealTile(idx, isBonus));
  });

  // Header buttons
  wordsBtn.addEventListener('click', () => {
    if (_refs) showWordsModal(_refs.state, cb);
  });
  const countBadge = root.querySelector<HTMLElement>('#words-count-badge');
  if (countBadge) countBadge.textContent = `${state.words.filter(w => w.complete).length}/${totalWords}`;

  root.querySelector('#btn-new-game')!.addEventListener('click', cb.onNewGame);
  root.querySelector('#btn-hs')!      .addEventListener('click', cb.onShowHighScores);
  root.querySelector('#btn-ach')!     .addEventListener('click', cb.onShowAchievements);

  const refs: AppRefs = {
    gridSize, totalWords, cells, allTiles,
    hint, scoreBar, wordsBtn, handPanel, luckyPanel, luckyTilesEl,
    luckyDrawRendered: false, state, cb,
  };

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
      const el   = cells[r][c];
      const cell = state.grid[r][c];
      const cls  = cellClass(r, c, cell, state);
      if (el.className !== cls) el.className = cls;
      const content = cellContent(r, c, cell, state);
      if (el.textContent !== content) el.textContent = content;
      const multStr = cell.multiplier ? `${cell.multiplier}×` : '';
      if (el.dataset.mult !== multStr) el.dataset.mult = multStr;
      const lscore = (!cell.isWild && cell.wordIds.length > 0) ? String(LETTER_SCORES[cell.letter] ?? 1) : '';
      if (el.dataset.lscore !== lscore) el.dataset.lscore = lscore;
    }

  allTiles.forEach((el, i) => {
    const isBonus = i >= state.hand.length;
    const idx     = isBonus ? i - state.hand.length : i;
    const tile    = isBonus ? state.bonus[idx] : state.hand[idx];
    if (!tile) return;
    setClass(el, tileClass(tile, isBonus, state));
    setText(el, tile.revealed ? tile.letter : (isBonus ? '🎁' : ''));
  });

  hint.innerHTML = hintHTML(state);

  const done  = state.words.filter(w => w.complete).length;
  const score = computeScore(state);
  scoreBar.innerHTML = scoreBarHTML(done, totalWords, score);

  const countBadge = document.getElementById('words-count-badge');
  if (countBadge) countBadge.textContent = `${done}/${totalWords}`;

  // Lucky draw visibility toggle
  const allRevealed = state.hand.every(t => t.revealed) && state.bonus.every(t => t.revealed);
  const showLucky   = allRevealed && !state.luckyDrawUsed && state.luckyDrawPool.length > 0;

  if (showLucky) {
    handPanel .classList.add   ('hidden-panel');
    luckyPanel.classList.remove('hidden-panel');
    bindLuckyDrawTiles(refs, state, cb);
  } else {
    handPanel .classList.remove('hidden-panel');
    luckyPanel.classList.add   ('hidden-panel');
  }
}
