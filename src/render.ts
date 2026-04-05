import { GRID_SIZE, TARGET_WORDS } from './constants';
import { tileIsUseful } from './gameLogic';
import type { GameState, HighScore } from './types';

// ── Callbacks ────────────────────────────────────────────────────────────────

export interface RenderCallbacks {
  onRevealTile:        (idx: number, isBonus: boolean) => void;
  onScratchCell:       (r: number, c: number) => void;
  onRevealAllHand:     () => void;
  onRevealAllBonus:    () => void;
  onScratchAllAvail:   () => void;
  onNewGame:           () => void;
  onWordClick:         (word: string) => void;
  onDifficultyChange:  (difficulty: number) => void;
  onShowHighScores:    () => void;
}

// ── Ref-based render state ────────────────────────────────────────────────────

interface AppRefs {
  cells:          HTMLElement[][];  // [GRID_SIZE][GRID_SIZE]
  handTiles:      HTMLElement[];
  bonusTiles:     HTMLElement[];
  badges:         HTMLElement[];
  hint:           HTMLElement;
  scoreBar:       HTMLElement;
  scratchAvailBtn: HTMLElement;
}

let _refs: AppRefs | null = null;

/** Call before renderLoading / renderError — forces a full DOM rebuild next render(). */
export function resetRenderer(): void {
  _refs = null;
}

// ── Main render entry point ───────────────────────────────────────────────────

/**
 * On first call after reset: builds full HTML, captures refs, binds listeners.
 * On subsequent calls: applies targeted DOM updates (no innerHTML, no re-binding).
 */
export function render(state: GameState, cb: RenderCallbacks, difficulty: number): void {
  const root = document.getElementById('app')!;
  if (!_refs) {
    root.innerHTML = buildInitialHTML(state, difficulty);
    _refs = captureAndBindRefs(root, state, cb);
    return;
  }
  applyStateToRefs(_refs, state);
}

// ── Loading / Error screens ───────────────────────────────────────────────────

export function renderLoading(): void {
  resetRenderer();
  document.getElementById('app')!.innerHTML = `
  <div class="ticket screen-card">
    <div class="screen-inner">
      <div class="loading-icon" id="load-icon">🎰</div>
      <div class="loading-title" id="load-title">Generating your ticket…</div>
      <div class="loading-bar-wrap">
        <div class="loading-bar" id="load-bar" style="width:0%"></div>
      </div>
      <div class="loading-attempt" id="load-attempt">Starting…</div>
    </div>
  </div>`;
}

export function updateLoadingProgress(attempt: number, max: number, done: boolean): void {
  const icon       = document.getElementById('load-icon');
  const title      = document.getElementById('load-title');
  const bar        = document.getElementById('load-bar');
  const attemptEl  = document.getElementById('load-attempt');
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function setClass(el: HTMLElement, cls: string): void {
  if (el.className !== cls) el.className = cls;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function countAvail(state: GameState): number {
  return state.grid.flat().filter(
    c => c.wordIds.length > 0 && !c.scratched &&
         (c.isWild || state.revealedLetters.has(c.letter))
  ).length;
}

function scoreToStars(words: number): string {
  const ratio = words / TARGET_WORDS;
  const n = ratio === 0 ? 0 : ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.6 ? 3 : ratio < 0.85 ? 4 : 5;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// ── Cell class / content ──────────────────────────────────────────────────────

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
  if (cell.isWild && !cell.scratched) return '⭐';
  return cell.letter;
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

// ── Score bar HTML ────────────────────────────────────────────────────────────

function scoreBarHTML(completeCount: number): string {
  const stars = scoreToStars(completeCount);
  return `<span class="score-count">${completeCount}<span class="score-total"> / ${TARGET_WORDS}</span></span>
          <span class="score-label">words</span>
          <span class="score-stars">${stars}</span>`;
}

// ── Hint HTML ─────────────────────────────────────────────────────────────────

function hintHTML(state: GameState): string {
  const avail = countAvail(state);
  if (avail > 0)
    return `<span class="hint-avail">👆 ${avail} cell${avail !== 1 ? 's' : ''} ready to scratch!</span>`;
  if (state.hand.some(t => !t.revealed))
    return `<span class="hint-idle">Scratch a tile below to reveal letters</span>`;
  return `<span class="hint-idle">Scratch bonus tiles or start a new ticket</span>`;
}

// ── Full initial HTML build ───────────────────────────────────────────────────

function buildHeader(difficulty: number): string {
  const level = difficulty <= 0.3 ? 'easy' : difficulty <= 0.65 ? 'medium' : 'hard';
  return `
  <div class="hdr">
    <div class="hdr-title">🏖️ LUCKY LETTERS 🏖️</div>
    <div class="hdr-row">
      <div class="hdr-sub">20 words · scratch tiles then scratch grid cells!</div>
      <div class="hdr-actions">
        <div class="diff-control">
          <span class="diff-label">LEVEL</span>
          <div class="diff-pills">
            <button class="diff-pill${level === 'easy'   ? ' active' : ''}" data-diff="easy">Easy</button>
            <button class="diff-pill${level === 'medium' ? ' active' : ''}" data-diff="medium">Med</button>
            <button class="diff-pill${level === 'hard'   ? ' active' : ''}" data-diff="hard">Hard</button>
          </div>
        </div>
        <button id="btn-hs" class="btn-hs" title="High Scores">🏆</button>
      </div>
    </div>
  </div>`;
}

function buildGridHTML(state: GameState): string {
  const cells = state.grid.flatMap((row, r) =>
    row.map((cell, c) => {
      const cls     = cellClass(r, c, cell, state);
      const content = cellContent(cell);
      return `<div class="${cls}">${content}</div>`;
    })
  ).join('');
  return `<div class="grid">${cells}</div>`;
}

function buildBadgesHTML(state: GameState): string {
  const items = state.words.map(w =>
    `<div class="badge badge-clickable${w.complete ? ' done' : ''}">${w.text}</div>`
  ).join('');
  return `<div class="badges">${items}</div>`;
}

function buildHandHTML(state: GameState): string {
  const tiles = state.hand.map((t, _i) => {
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

function buildBonusHTML(state: GameState): string {
  const tiles = state.bonus.map((t, _i) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, state);
      return `<div class="tile bonus-tile revealed${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile bonus-tile hidden">🎁</div>`;
  }).join('');
  return `
  <div class="bonus-section">
    <div class="section-label">BONUS</div>
    <div class="bonus-tiles">${tiles}</div>
  </div>`;
}

function buildInitialHTML(state: GameState, difficulty: number): string {
  const completeCount = state.words.filter(w => w.complete).length;
  const avail         = countAvail(state);

  return `
  <div class="ticket">
    ${buildHeader(difficulty)}
    <div class="grid-section">
      ${buildBadgesHTML(state)}
      ${buildGridHTML(state)}
      <div class="grid-hint">${hintHTML(state)}</div>
    </div>
    <div class="bottom-section">
      ${buildHandHTML(state)}
      ${buildBonusHTML(state)}
    </div>
    <div class="score-bar">${scoreBarHTML(completeCount)}</div>
    <div class="btn-row">
      <button id="btn-scratch-avail" class="btn btn-secondary"${avail === 0 ? ' style="display:none"' : ''}>🖊 Scratch All Available</button>
      <button id="btn-new-game" class="btn btn-primary">🎰 New Ticket</button>
    </div>
  </div>`;
}

// ── Ref capture + listener binding ───────────────────────────────────────────

function captureAndBindRefs(root: HTMLElement, state: GameState, cb: RenderCallbacks): AppRefs {
  // ── Cells (row-major order matches DOM order) ─────────────────────────────
  const allCellEls = root.querySelectorAll<HTMLElement>('.cell');
  const cells: HTMLElement[][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    cells[r] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      cells[r][c] = allCellEls[r * GRID_SIZE + c];
    }
  }

  // ── Tiles ──────────────────────────────────────────────────────────────────
  const handTiles  = Array.from(root.querySelectorAll<HTMLElement>('.hand-section .tile'));
  const bonusTiles = Array.from(root.querySelectorAll<HTMLElement>('.bonus-section .tile'));

  // ── Badges, hint, score bar, buttons ────────────────────────────────────────
  const badges         = Array.from(root.querySelectorAll<HTMLElement>('.badge'));
  const hint           = root.querySelector<HTMLElement>('.grid-hint')!;
  const scoreBar       = root.querySelector<HTMLElement>('.score-bar')!;
  const scratchAvailBtn = root.querySelector<HTMLElement>('#btn-scratch-avail')!;

  const refs: AppRefs = { cells, handTiles, bonusTiles, badges, hint, scoreBar, scratchAvailBtn };

  // ── Attach click listeners ────────────────────────────────────────────────

  // Cells: attach to all word + wild cells; game logic validates scratching
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = state.grid[r][c];
      if (cell.wordIds.length > 0 || cell.isWild) {
        const rr = r, cc = c;
        cells[r][c].addEventListener('click', () => cb.onScratchCell(rr, cc));
      }
    }
  }

  // Hand tiles
  handTiles.forEach((el, i) => {
    el.addEventListener('click', () => cb.onRevealTile(i, false));
  });

  // Bonus tiles
  bonusTiles.forEach((el, i) => {
    el.addEventListener('click', () => cb.onRevealTile(i, true));
  });

  // Word badges
  badges.forEach((el, i) => {
    const word = state.words[i].text;
    el.addEventListener('click', () => cb.onWordClick(word));
  });

  // Buttons
  scratchAvailBtn.addEventListener('click', cb.onScratchAllAvail);
  root.querySelector('#btn-new-game')!.addEventListener('click', cb.onNewGame);
  root.querySelector('#btn-hs')!.addEventListener('click', cb.onShowHighScores);

  // Difficulty pills
  root.querySelectorAll<HTMLElement>('.diff-pill').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.diff!;
      const val = key === 'easy' ? 0.2 : key === 'hard' ? 0.85 : 0.55;
      cb.onDifficultyChange(val);
      root.querySelectorAll('.diff-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
    });
  });

  return refs;
}

// ── Targeted DOM update ───────────────────────────────────────────────────────

function applyStateToRefs(refs: AppRefs, state: GameState): void {
  const { cells, handTiles, bonusTiles, badges, hint, scoreBar, scratchAvailBtn } = refs;

  // Grid cells
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const el   = cells[r][c];
      const cell = state.grid[r][c];
      setClass(el, cellClass(r, c, cell, state));
      setText(el, cellContent(cell));
    }
  }

  // Hand tiles
  state.hand.forEach((tile, i) => {
    const el = handTiles[i];
    setClass(el, tileClass(tile, false, state));
    setText(el, tile.revealed ? tile.letter : '');
  });

  // Bonus tiles
  state.bonus.forEach((tile, i) => {
    const el = bonusTiles[i];
    setClass(el, tileClass(tile, true, state));
    setText(el, tile.revealed ? tile.letter : '🎁');
  });

  // Badges
  state.words.forEach((word, i) => {
    setClass(badges[i], `badge badge-clickable${word.complete ? ' done' : ''}`);
  });

  // Hint
  hint.innerHTML = hintHTML(state);

  // Score bar
  const completeCount = state.words.filter(w => w.complete).length;
  scoreBar.innerHTML = scoreBarHTML(completeCount);

  // Scratch avail button
  scratchAvailBtn.style.display = countAvail(state) > 0 ? '' : 'none';
}

// ── Definition Modal ──────────────────────────────────────────────────────────

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
          : `<p class="def-text">${definition}</p>`
        }
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
  const overlay = document.getElementById(DEF_MODAL_ID);
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}

// ── High Score Modal ──────────────────────────────────────────────────────────

const HS_MODAL_ID = 'hs-modal-overlay';

export function showHighScoreModal(scores: HighScore[]): void {
  document.getElementById(HS_MODAL_ID)?.remove();

  const top10 = [...scores].sort((a, b) => b.words - a.words).slice(0, 10);

  const rows = top10.length === 0
    ? `<tr><td colspan="4" class="hs-empty">No scores yet — play a game!</td></tr>`
    : top10.map((s, i) => {
        const d = new Date(s.date);
        const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const stars = scoreToStars(s.words);
        return `<tr class="${i === 0 ? 'hs-top' : ''}">
          <td class="hs-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
          <td class="hs-score">${s.words} <span class="hs-total">/ ${TARGET_WORDS}</span></td>
          <td class="hs-stars">${stars}</td>
          <td class="hs-date">${date}<br><span class="hs-time">${time}</span></td>
        </tr>`;
      }).join('');

  const overlay = document.createElement('div');
  overlay.id = HS_MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
    <div class="def-modal hs-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">🏆 High Scores</span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body hs-body">
        <table class="hs-table">
          <thead>
            <tr>
              <th>#</th><th>Score</th><th>Stars</th><th>Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) hideHighScoreModal(); });
  overlay.querySelector('.def-modal-close')!.addEventListener('click', hideHighScoreModal);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { hideHighScoreModal(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideHighScoreModal(): void {
  const overlay = document.getElementById(HS_MODAL_ID);
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}
