import { PRIZES } from './constants';
import { tileIsUseful } from './gameLogic';
import type { GameState } from './types';

// ── Public render function ────────────────────────────────────────────────────

export interface RenderCallbacks {
  onRevealTile:        (idx: number, isBonus: boolean) => void;
  onScratchCell:       (r: number, c: number) => void;
  onRevealAllHand:     () => void;
  onRevealAllBonus:    () => void;
  onScratchAllAvail:   () => void;
  onNewGame:           () => void;
  onWordClick:         (word: string) => void;
}

export function render(state: GameState, cb: RenderCallbacks): void {
  const root = document.getElementById('app')!;
  root.innerHTML = buildHTML(state);
  attachListeners(state, cb, root);
}

export function renderLoading(): void {
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
  const icon    = document.getElementById('load-icon');
  const title   = document.getElementById('load-title');
  const bar     = document.getElementById('load-bar');
  const attempt_el = document.getElementById('load-attempt');
  if (!icon || !title || !bar || !attempt_el) return;

  if (done) {
    icon.textContent    = '🎉';
    title.textContent   = 'Ticket ready!';
    bar.style.width     = '100%';
    bar.classList.add('bar-done');
    attempt_el.textContent = `Found in ${attempt} attempt${attempt !== 1 ? 's' : ''}`;
  } else {
    bar.style.width        = `${Math.round((attempt / max) * 100)}%`;
    attempt_el.textContent = `Attempt ${attempt} / ${max}`;
  }
}

export function renderError(onRetry: () => void): void {
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

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildHTML(s: GameState): string {
  const completeCount = s.words.filter(w => w.complete).length;
  const prize = PRIZES.filter(p => p.words <= completeCount).at(-1) ?? null;
  const allRevealed   = s.hand.every(t => t.revealed) && s.bonus.every(t => t.revealed);

  return `
  <div class="ticket">
    ${buildHeader()}
    <div class="main-row">
      ${buildPrizeKey(s, prize)}
      <div class="grid-col">
        ${buildBadges(s)}
        ${buildGrid(s)}
        <div class="grid-hint">
          ${gridHint(s)}
        </div>
      </div>
    </div>
    <div class="bottom-section">
      ${buildHand(s)}
      ${buildBonus(s)}
    </div>
    ${buildPrizeReveal(completeCount, prize, allRevealed)}
    ${buildButtons(s, allRevealed)}
  </div>`;
}

function buildHeader(): string {
  return `
  <div class="hdr">
    <div class="hdr-title">🏖️ LUCKY LETTERS 🏖️</div>
    <div class="hdr-sub">20 words · scratch tiles then scratch grid cells to win!</div>
  </div>`;
}

function buildPrizeKey(s: GameState, prize: { prize: string } | null): string {
  const completeCount = s.words.filter(w => w.complete).length;
  const rows = PRIZES.map(p => {
    const won = completeCount >= p.words;
    const best = prize && prize.prize === p.prize;
    return `<div class="pk-row${best ? ' active' : won ? ' reached' : ''}">
      <span class="wl">${p.words}w</span>
      <span class="am">${p.prize}</span>
    </div>`;
  }).join('');
  return `
  <div class="prize-key">
    <div class="pk-title">PRIZE KEY</div>
    ${rows}
  </div>`;
}

function buildGrid(s: GameState): string {
  const cells = s.grid.map((row, r) =>
    row.map((cell, c) => {
      const isWordCell = cell.wordIds.length > 0;

      if (cell.isWild) {
        const done = cell.wordIds.some(id => s.words.find(w => w.id === id)?.complete);
        if (cell.scratched) {
          const justScratched = s.animatedCells.has(`${r},${c}`);
          return `<div class="cell cell-wild scratched${done ? ' word-done' : ''}${justScratched ? ' just-scratched' : ''}" title="Wildcard">${cell.letter}</div>`;
        }
        return `<div class="cell cell-wild available" data-r="${r}" data-c="${c}" title="Wildcard — scratch for free!">⭐</div>`;
      }

      if (!isWordCell) {
        // Filler: show letter, dimmed, not interactive
        return `<div class="cell cell-fill">${cell.letter}</div>`;
      }

      // Word cell
      if (cell.scratched) {
        const wordDone = cell.wordIds.some(id => s.words.find(w => w.id === id)?.complete);
        const justScratched = s.animatedCells.has(`${r},${c}`);
        return `<div class="cell cell-word scratched${wordDone ? ' word-done' : ''}${justScratched ? ' just-scratched' : ''}">${cell.letter}</div>`;
      }

      const available = s.revealedLetters.has(cell.letter);
      if (available) {
        const animateIn = s.newlyAvailableCells.has(`${r},${c}`);
        return `<div class="cell cell-word available${animateIn ? ' animate-in' : ''}" data-r="${r}" data-c="${c}" title="Click to scratch!">${cell.letter}</div>`;
      }

      return `<div class="cell cell-word locked">${cell.letter}</div>`;
    }).join('')
  ).join('');

  return `<div class="grid">${cells}</div>`;
}

function buildBadges(s: GameState): string {
  const badges = s.words.map(w =>
    `<div class="badge${w.complete ? ' done' : ''} badge-clickable" data-word="${w.text}" title="Click to see definition">${w.text}</div>`
  ).join('');
  return `<div class="badges">${badges}</div>`;
}

function gridHint(s: GameState): string {
  const avail = s.grid.flat().filter(
    c => c.wordIds.length > 0 && !c.scratched &&
         (c.isWild || s.revealedLetters.has(c.letter))
  ).length;
  if (avail > 0) return `<span class="hint-avail">👆 ${avail} cell${avail !== 1 ? 's' : ''} ready to scratch!</span>`;
  if (s.hand.some(t => !t.revealed)) return `<span class="hint-idle">Scratch a tile below to reveal letters</span>`;
  return `<span class="hint-idle">Scratch bonus tiles or start a new ticket</span>`;
}

function buildHand(s: GameState): string {
  const tiles = s.hand.map((t, i) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, s);
      return `<div class="tile revealed${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile hidden" data-tile="${i}" title="Scratch me!"></div>`;
  }).join('');

  return `
  <div class="hand-section">
    <div class="section-label">YOUR LETTERS <span class="sub-hint">(scratch to reveal)</span></div>
    <div class="tile-grid">${tiles}</div>
  </div>`;
}

function buildBonus(s: GameState): string {
  const tiles = s.bonus.map((t, i) => {
    if (t.revealed) {
      const useful = tileIsUseful(t.letter, s);
      return `<div class="tile bonus-tile revealed${useful ? ' useful' : ''}">${t.letter}</div>`;
    }
    return `<div class="tile bonus-tile hidden" data-bonus="${i}" title="Bonus — scratch anytime!">🎁</div>`;
  }).join('');

  return `
  <div class="bonus-section">
    <div class="section-label">BONUS <span class="sub-hint">(scratch anytime)</span></div>
    <div class="bonus-tiles">${tiles}</div>
  </div>`;
}

function buildPrizeReveal(
  completeCount: number,
  prize: { prize: string } | null,
  allRevealed: boolean
): string {
  if (!allRevealed && completeCount === 0) return '';
  const plural = completeCount !== 1 ? 'S' : '';
  const prizeHTML = prize
    ? `<div class="pr-amount">🎉 ${prize.prize}!</div>`
    : `<div class="pr-amount no-prize">No Prize Yet</div>
       <div class="pr-none">Complete 3+ words to win</div>`;
  return `
  <div class="prize-reveal show">
    <div class="pr-count">${completeCount} WORD${plural} COMPLETE</div>
    ${prizeHTML}
  </div>`;
}

function buildButtons(s: GameState, allRevealed: boolean): string {
  const unrevealed = s.hand.filter(t => !t.revealed).length;
  const avail = s.grid.flat().filter(
    c => c.wordIds.length > 0 && !c.scratched &&
         (c.isWild || s.revealedLetters.has(c.letter))
  ).length;

  const btns: string[] = [];

  if (unrevealed > 0 && false)
    btns.push(`<button id="btn-reveal-all" class="btn btn-secondary">⚡ Reveal All (${unrevealed})</button>`);
  if (avail > 0)
    btns.push(`<button id="btn-scratch-avail" class="btn btn-secondary">🖊 Scratch All Available</button>`);
  if (!allRevealed && unrevealed === 0 && false)
    btns.push(`<button id="btn-reveal-bonus" class="btn btn-secondary">🎁 Reveal Bonus</button>`);

  btns.push(`<button id="btn-new-game" class="btn btn-primary">🎰 New Ticket</button>`);

  return `<div class="btn-row">${btns.join('')}</div>`;
}

// ── Event listeners ───────────────────────────────────────────────────────────

function attachListeners(_s: GameState, cb: RenderCallbacks, root: HTMLElement): void {
  // Word badges → definition modal
  root.querySelectorAll<HTMLElement>('[data-word]').forEach(el => {
    el.addEventListener('click', () => cb.onWordClick(el.dataset.word!));
  });

  // Hand tiles
  root.querySelectorAll<HTMLElement>('[data-tile]').forEach(el => {
    el.addEventListener('click', () => cb.onRevealTile(Number(el.dataset.tile), false));
  });

  // Bonus tiles
  root.querySelectorAll<HTMLElement>('[data-bonus]').forEach(el => {
    el.addEventListener('click', () => cb.onRevealTile(Number(el.dataset.bonus), true));
  });

  // Grid cells (available word cells)
  root.querySelectorAll<HTMLElement>('[data-r]').forEach(el => {
    el.addEventListener('click', () =>
      cb.onScratchCell(Number(el.dataset.r), Number(el.dataset.c))
    );
  });

  // Buttons
  root.querySelector('#btn-reveal-all')
      ?.addEventListener('click', cb.onRevealAllHand);
  root.querySelector('#btn-reveal-bonus')
      ?.addEventListener('click', cb.onRevealAllBonus);
  root.querySelector('#btn-scratch-avail')
      ?.addEventListener('click', cb.onScratchAllAvail);
  root.querySelector('#btn-new-game')
      ?.addEventListener('click', cb.onNewGame);
}
// ── Definition Modal ──────────────────────────────────────────────────────────

const MODAL_ID = 'def-modal-overlay';

/**
 * Show (or update) the definition modal.
 * Call with definition=null to show a loading spinner.
 * Call with a string to show the definition.
 */
export function showDefinitionModal(word: string, definition: string | null): void {
  // Remove any existing modal first
  document.getElementById(MODAL_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = `
    <div class="def-modal" role="dialog" aria-modal="true" aria-label="Definition of ${word}">
      <div class="def-modal-header">
        <span class="def-modal-word">${word}</span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body">
        ${definition === null
          ? `<div class="def-loading">
               <div class="def-spinner"></div>
               <span>Loading dictionary…</span>
             </div>`
          : `<p class="def-text">${definition}</p>`
        }
      </div>
    </div>`;

  // Close on overlay click (outside modal card)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideDefinitionModal();
  });

  // Close button
  overlay.querySelector('.def-modal-close')!
    .addEventListener('click', hideDefinitionModal);

  // Close on Escape
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { hideDefinitionModal(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  // Trigger CSS enter animation on next frame
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function hideDefinitionModal(): void {
  const overlay = document.getElementById(MODAL_ID);
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
}
