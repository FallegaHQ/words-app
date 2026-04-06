import { GRID_CONFIGS, LETTER_SCORES } from '../constants';
import { tileIsUseful, computeScore } from '../core/gameLogic';
import type { GameState, GameConfig, RenderCallbacks, GameViewContext } from '../types';
import type { Cell } from '../types';
import { diffLabel, sizeLabel, scoreToStars } from './utils';
import { showWordsModal } from './modals/words';
import { isSFXEnabled, setSFXEnabled, playSFX } from './sfx';

// ── Default view context (full game, no drafting) ─────────────────────────────

export const defaultGameViewContext = (): GameViewContext => ({
  handStatusMessage:    '',
  showWordsButton:      true,
  draft:                null,
  seedDisplay:          null,
  hideSeedInHeader:     false,
  lockHandTileClicks:   false,
  handPanelMessageOnly: null,
  showCountdown:        null,
  interactionLocked:    false,
});

// ── Ref-based render state ───────────────────────────────────────────────────

interface AppRefs {
  gridSize:          number;
  totalWords:        number;
  cells:             HTMLElement[][];
  allTiles:          HTMLElement[];
  hint:              HTMLElement;
  wordsBtn:          HTMLElement | null;
  handPanel:         HTMLElement;
  handPanelCore:     HTMLElement;
  handStatusSlot:    HTMLElement;
  luckyPanel:        HTMLElement;
  luckyTilesEl:      HTMLElement;
  luckyDrawRendered: boolean;
  state:             GameState;
  cb:                RenderCallbacks;
  viewCtx:           GameViewContext;
  ticketEl:          HTMLElement;
  countdownOverlay:  HTMLElement | null;
  sfxBtn:            HTMLElement | null;
  /** Detect when hand panel structure must be rebuilt */
  handPanelSig:      string;
}

let _refs: AppRefs | null = null;
let _timerCleanup: (() => void) | null = null;

export function resetRenderer(): void {
  _timerCleanup?.();
  _timerCleanup = null;
  _refs = null;
}

// ── Elapsed time: updates `#score-elapsed` only (no full re-render) ───────────

export function startElapsedTimer(getElapsedMs: () => number): void {
  _timerCleanup?.();
  const tick = () => {
    const el = document.getElementById('score-elapsed');
    if (el) {
      const ms = getElapsedMs();
      const sec = Math.floor(ms / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      el.textContent = m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
    }
  };
  tick();
  const id = window.setInterval(tick, 1000);
  _timerCleanup = () => clearInterval(id);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function render(
  state: GameState,
  cb: RenderCallbacks,
  config: GameConfig,
  viewCtx: GameViewContext = defaultGameViewContext()
): void {
  const root = document.getElementById('app')!;
  if (!_refs) {
    root.innerHTML = buildInitialHTML(state, config, viewCtx);
    _refs = captureAndBindRefs(root, state, cb, config, viewCtx);
    return;
  }
  _refs.state    = state;
  _refs.viewCtx = viewCtx;
  applyStateToRefs(_refs, state, cb, config, viewCtx);
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

// ── Fog / cell visuals ────────────────────────────────────────────────────────

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

// ── Header ────────────────────────────────────────────────────────────────────

function buildHeader(config: GameConfig, viewCtx: GameViewContext): string {
  const seedBlock =
    viewCtx.seedDisplay && !viewCtx.hideSeedInHeader
      ? `<div class="seed-row">
           <span class="seed-badge" id="seed-badge">${viewCtx.seedDisplay}</span>
           <button type="button" class="seed-copy-btn" id="seed-copy" title="Copy seed">📋</button>
         </div>`
      : '';

  const wordsBtn = viewCtx.showWordsButton
    ? `<button id="btn-words" class="btn-icon" title="Words List">📋 <span id="words-count-badge">0</span></button>`
    : '';

  const sfxOn = isSFXEnabled();
  const sfxBtn = `<button type="button" id="btn-sfx" class="btn-hs" title="Sound">${sfxOn ? '🔊' : '🔇'}</button>`;

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
        ${wordsBtn}
        <button id="btn-ach"   class="btn-icon" title="Achievements">🏅</button>
        ${sfxBtn}
        <button id="btn-hs"    class="btn-hs"   title="High Scores">🏆</button>
      </div>
    </div>
    ${seedBlock}
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
  for (let n = 9; n >= 4; n--) if (total % n === 0) return n;
  let best = 5, bestOrphans = Infinity;
  for (let n = 4; n <= 9; n++) {
    const orphans = total % n === 0 ? 0 : n - (total % n);
    if (orphans < bestOrphans || (orphans === bestOrphans && n > best)) {
      bestOrphans = orphans; best = n;
    }
  }
  return best;
}

/**
 * While a status line is shown, hide the real hand/bonus tile grid (draft + message-only modes keep their UI).
 */
function shouldHideHandTilesForStatus(state: GameState, viewCtx: GameViewContext): boolean {
  if (!viewCtx.handStatusMessage.trim()) return false;
  if (viewCtx.handPanelMessageOnly != null) return false;
  if (viewCtx.draft != null) return false;
  return state.hand.length + state.bonus.length > 0;
}

/** Draft UI: neutral tiles — every letter is selectable (player may pick “wrong” letters). */
function buildDraftLetterGrid(segment: string[]): string {
  const btns = segment.map(l =>
    `<button type="button" class="draft-letter-btn" data-letter="${l}">${l}</button>`
  ).join('');
  return `<div class="draft-letter-grid">${btns}</div>`;
}

/** Core hand area only; status line lives in `#hand-status-slot` (updated every render). */
function buildHandPanelInner(state: GameState, viewCtx: GameViewContext): string {
  if (viewCtx.handPanelMessageOnly) {
    return `<div class="hand-message-only">${viewCtx.handPanelMessageOnly}</div>`;
  }

  if (viewCtx.draft) {
    const { segments, segmentIndex, picks } = viewCtx.draft;
    const total = segments.length;
    const cur   = segments[segmentIndex] ?? [];
    const title = `Choose Your Letters (${picks.length + 1}/${total})`;
    return `
    <div class="section-label draft-title">${title}</div>
    ${buildDraftLetterGrid(cur)}`;
  }

  if (shouldHideHandTilesForStatus(state, viewCtx)) {
    return '<div class="hand-core-placeholder" aria-hidden="true"></div>';
  }

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
  <div class="section-label">YOUR TILES <span class="sub-hint">(scratch to reveal · 🎁 bonus anytime)</span></div>
  <div class="tile-grid" style="grid-template-columns:repeat(${perRow},1fr)">${handTiles}${bonusTiles}</div>`;
}

function buildCombinedHandHTML(state: GameState, viewCtx: GameViewContext): string {
  return `
  <div class="hand-panel hand-panel-fixed" id="hand-panel">
    <div id="hand-status-slot" class="hand-status-msg" hidden></div>
    <div id="hand-panel-core">${buildHandPanelInner(state, viewCtx)}</div>
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

/** Words/score/stars only — `#score-elapsed` lives in a sibling node and is not replaced. */
function scoreBarMainHTML(words: number, total: number, score: number): string {
  const stars = scoreToStars(words, total);
  const pts   = score > 0
    ? `<span class="score-sep">·</span><span class="score-pts">${score.toLocaleString()}</span><span class="score-label">pts</span>`
    : '';
  return `<span class="score-count">${words}<span class="score-total"> / ${total}</span></span>
          <span class="score-label">words</span>
          ${pts}
          <span class="score-stars">${stars}</span>`;
}

function buildInitialHTML(state: GameState, config: GameConfig, viewCtx: GameViewContext): string {
  const total = GRID_CONFIGS[config.gridSizeKey].targetWords;
  const done  = state.words.filter(w => w.complete).length;
  const score = computeScore(state);
  const cd    = viewCtx.showCountdown != null
    ? `<div class="countdown-overlay" id="countdown-overlay" role="status" aria-live="assertive"><div class="countdown-inner">Revealing full board in ${viewCtx.showCountdown}…</div></div>`
    : '';

  const ticketCls = [
    'ticket',
    viewCtx.interactionLocked ? 'ticket-interaction-locked auto-scratching' : '',
    viewCtx.lockHandTileClicks ? 'ticket-locked-hand' : '',
  ].filter(Boolean).join(' ');

  return `
  <div class="${ticketCls}" id="game-ticket">
    ${buildHeader(config, viewCtx)}
    <div class="grid-section">
      ${buildGridHTML(state)}
      <div class="grid-hint">${hintHTML(state)}</div>
    </div>
    <div class="bottom-section">
      ${buildCombinedHandHTML(state, viewCtx)}
      ${buildLuckyDrawHTML(state)}
    </div>
    <div class="score-bar">
      <span id="score-main">${scoreBarMainHTML(done, total, score)}</span>
      <span class="score-sep">·</span>
      <span class="score-time-wrap"><span class="score-label">time</span> <span id="score-elapsed" class="score-elapsed">0s</span></span>
    </div>
    <div class="btn-row">
      <button id="btn-hub" class="btn btn-hub">🏠 Hub</button>
      <button id="btn-new-game" class="btn btn-primary">🎰 New Ticket</button>
    </div>
    ${cd || '<div class="countdown-overlay hidden" id="countdown-overlay" aria-hidden="true"></div>'}
  </div>`;
}

// ── Ref capture + binding ─────────────────────────────────────────────────────

function captureAndBindRefs(
  root: HTMLElement,
  state: GameState,
  cb: RenderCallbacks,
  config: GameConfig,
  viewCtx: GameViewContext
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

  const handPanel      = root.querySelector<HTMLElement>('#hand-panel')!;
  const handPanelCore  = root.querySelector<HTMLElement>('#hand-panel-core')!;
  const handStatusSlot = root.querySelector<HTMLElement>('#hand-status-slot')!;
  const allTiles       = Array.from(handPanelCore.querySelectorAll<HTMLElement>('.tile'));

  const hint            = root.querySelector<HTMLElement>('.grid-hint')!;
  const wordsBtn        = root.querySelector<HTMLElement>('#btn-words');
  const luckyPanel      = root.querySelector<HTMLElement>('#lucky-panel')!;
  const luckyTilesEl    = root.querySelector<HTMLElement>('#lucky-tiles')!;
  const ticketEl        = root.querySelector<HTMLElement>('#game-ticket')!;
  const countdownOverlay = root.querySelector<HTMLElement>('#countdown-overlay');
  const sfxBtn          = root.querySelector<HTMLElement>('#btn-sfx');

  // Performance: scratching is automatic — no cell click listeners.

  const bindTiles = () => {
    const tiles = Array.from(handPanelCore.querySelectorAll<HTMLElement>('.tile'));
    tiles.forEach((el, i) => {
      const isBonus = i >= state.hand.length;
      const idx     = isBonus ? i - state.hand.length : i;
      el.addEventListener('click', () => {
        if (_refs?.viewCtx.interactionLocked || _refs?.viewCtx.lockHandTileClicks) return;
        cb.onRevealTile(idx, isBonus);
      });
    });
    return tiles;
  };

  const tilesBound = allTiles.length ? bindTiles() : [];

  handPanel.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const btn = t.closest('.draft-letter-btn');
    if (!btn) return;
    if (_refs?.viewCtx.interactionLocked || _refs?.viewCtx.lockHandTileClicks) return;
    const L = (btn as HTMLElement).dataset.letter;
    if (L) cb.onDraftPick?.(L);
  });

  if (wordsBtn) {
    wordsBtn.addEventListener('click', () => {
      if (_refs) showWordsModal(_refs.state, cb);
    });
  }

  const countBadge = root.querySelector<HTMLElement>('#words-count-badge');
  if (countBadge) countBadge.textContent = `${state.words.filter(w => w.complete).length}/${totalWords}`;

  root.querySelector('#btn-new-game')!.addEventListener('click', cb.onNewGame);
  root.querySelector('#btn-hub')!      .addEventListener('click', cb.onReturnToHub);
  root.querySelector('#btn-hs')!       .addEventListener('click', cb.onShowHighScores);
  root.querySelector('#btn-ach')!      .addEventListener('click', cb.onShowAchievements);

  if (sfxBtn) {
    sfxBtn.addEventListener('click', () => {
      const on = !isSFXEnabled();
      setSFXEnabled(on);
      sfxBtn.textContent = on ? '🔊' : '🔇';
      sfxBtn.title = on ? 'Sound on' : 'Sound off';
    });
  }

  const seedCopy = root.querySelector('#seed-copy');
  if (seedCopy && viewCtx.seedDisplay)
    seedCopy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(viewCtx.seedDisplay!).catch(() => {});
      playSFX('draft_pick');
    });

  const refs: AppRefs = {
    gridSize, totalWords, cells,
    allTiles: tilesBound,
    hint, wordsBtn, handPanel, handPanelCore, handStatusSlot, luckyPanel, luckyTilesEl,
    luckyDrawRendered: false, state, cb, viewCtx,
    ticketEl, countdownOverlay, sfxBtn,
    handPanelSig: handPanelStructureSig(state, viewCtx),
  };

  bindLuckyDrawTiles(refs, state, cb);
  syncHandStatusSlot(refs, state, viewCtx);
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
    clone.addEventListener('click', () => {
      if (refs.viewCtx.interactionLocked || refs.viewCtx.lockHandTileClicks) return;
      cb.onLuckyDrawPick(clone.dataset.lucky!);
    });
  });
}

function handPanelStructureSig(state: GameState, viewCtx: GameViewContext): string {
  return JSON.stringify({
    msg:   viewCtx.handPanelMessageOnly,
    draft: viewCtx.draft
      ? { si: viewCtx.draft.segmentIndex, pl: viewCtx.draft.picks.length, tl: viewCtx.draft.segments.length }
      : null,
    tiles: `${state.hand.length}+${state.bonus.length}`,
    hideTilesForStatus: shouldHideHandTilesForStatus(state, viewCtx),
  });
}

function rebuildHandPanel(refs: AppRefs, state: GameState, viewCtx: GameViewContext): void {
  refs.handPanelCore.innerHTML = buildHandPanelInner(state, viewCtx);
  const fresh = Array.from(refs.handPanelCore.querySelectorAll<HTMLElement>('.tile'));
  fresh.forEach((el, i) => {
    const isBonus = i >= state.hand.length;
    const idx     = isBonus ? i - state.hand.length : i;
    el.addEventListener('click', () => {
      if (_refs?.viewCtx.interactionLocked || _refs?.viewCtx.lockHandTileClicks) return;
      refs.cb.onRevealTile(idx, isBonus);
    });
  });
  refs.allTiles = fresh;
  refs.handPanelSig = handPanelStructureSig(state, viewCtx);
}

function syncHandStatusSlot(refs: AppRefs, state: GameState, viewCtx: GameViewContext): void {
  const s = viewCtx.handStatusMessage.trim();
  if (s) {
    refs.handStatusSlot.textContent = s;
    refs.handStatusSlot.hidden = false;
  } else {
    refs.handStatusSlot.textContent = '';
    refs.handStatusSlot.hidden = true;
  }
  const focus = shouldHideHandTilesForStatus(state, viewCtx);
  refs.handPanel.classList.toggle('hand-panel--has-status', !!s);
  refs.handPanel.classList.toggle('hand-panel--status-focus', focus);
}

function ensureWordsButton(
  refs: AppRefs, state: GameState, totalWords: number, viewCtx: GameViewContext
): void {
  if (!viewCtx.showWordsButton) return;
  if (document.getElementById('btn-words')) {
    refs.wordsBtn = document.getElementById('btn-words');
    return;
  }
  const hdrBtns = refs.ticketEl.querySelector('.hdr-btns');
  const ach     = document.getElementById('btn-ach');
  if (!hdrBtns || !ach) return;

  const btn = document.createElement('button');
  btn.id = 'btn-words';
  btn.className = 'btn-icon';
  btn.title = 'Words List';
  btn.innerHTML = `📋 <span id="words-count-badge">${state.words.filter(w => w.complete).length}/${totalWords}</span>`;
  btn.addEventListener('click', () => {
    if (_refs) showWordsModal(_refs.state, refs.cb);
  });
  hdrBtns.insertBefore(btn, ach);
  refs.wordsBtn = btn;
}

// ── Targeted DOM update ───────────────────────────────────────────────────────

function applyStateToRefs(
  refs: AppRefs,
  state: GameState,
  cb: RenderCallbacks,
  _config: GameConfig,
  viewCtx: GameViewContext
): void {
  const { gridSize, totalWords, cells, hint, handPanel, luckyPanel } = refs;

  refs.viewCtx = viewCtx;
  refs.ticketEl.classList.toggle('ticket-interaction-locked', viewCtx.interactionLocked);
  refs.ticketEl.classList.toggle('auto-scratching', viewCtx.interactionLocked);
  refs.ticketEl.classList.toggle('ticket-locked-hand', viewCtx.lockHandTileClicks);

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

  const sig = handPanelStructureSig(state, viewCtx);
  if (sig !== refs.handPanelSig) {
    rebuildHandPanel(refs, state, viewCtx);
  } else {
    refs.allTiles.forEach((el, i) => {
      const isBonus = i >= state.hand.length;
      const idx     = isBonus ? i - state.hand.length : i;
      const tile    = isBonus ? state.bonus[idx] : state.hand[idx];
      if (!tile) return;
      setClass(el, tileClass(tile, isBonus, state));
      setText(el, tile.revealed ? tile.letter : (isBonus ? '🎁' : ''));
    });
  }

  syncHandStatusSlot(refs, state, viewCtx);

  hint.innerHTML = hintHTML(state);

  const done  = state.words.filter(w => w.complete).length;
  const score = computeScore(state);
  const mainEl = document.getElementById('score-main');
  if (mainEl) mainEl.innerHTML = scoreBarMainHTML(done, totalWords, score);

  ensureWordsButton(refs, state, totalWords, viewCtx);
  const countBadge = document.getElementById('words-count-badge');
  if (countBadge) countBadge.textContent = `${done}/${totalWords}`;

  const allRevealed = state.hand.every(t => t.revealed) && state.bonus.every(t => t.revealed);
  const showLucky   = allRevealed && !state.luckyDrawUsed && state.luckyDrawPool.length > 0;

  if (showLucky) {
    handPanel .classList.add   ('hidden-panel');
    luckyPanel.classList.remove('hidden-panel');
    bindLuckyDrawTiles(refs, state, cb);
  } else {
    refs.luckyDrawRendered = false;
    handPanel .classList.remove('hidden-panel');
    luckyPanel.classList.add   ('hidden-panel');
  }

  if (viewCtx.showCountdown != null) {
    if (!refs.countdownOverlay) {
      refs.countdownOverlay = document.createElement('div');
      refs.countdownOverlay.className = 'countdown-overlay';
      refs.countdownOverlay.id = 'countdown-overlay';
      refs.ticketEl.appendChild(refs.countdownOverlay);
    }
    refs.countdownOverlay.innerHTML =
      `<div class="countdown-inner">Revealing full board in ${viewCtx.showCountdown}…</div>`;
    refs.countdownOverlay.classList.remove('hidden');
    refs.countdownOverlay.setAttribute('aria-hidden', 'false');
  } else if (refs.countdownOverlay) {
    refs.countdownOverlay.classList.add('hidden');
    refs.countdownOverlay.setAttribute('aria-hidden', 'true');
  }
}
