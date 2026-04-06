import { createOverlay, openModal, closeModalById, onEscape } from './base';
import { GRID_CONFIGS } from '../../constants';
import type { GameState, GameConfig } from '../../types';
import { computeScore, computeWordScore, getGridLetters } from '../../core/gameLogic';
import { diffLabel, sizeLabel, scoreToStars, formatDuration } from '../utils';

const ID = 'sum-modal-overlay';

export interface SummaryCallbacks {
  onPlayAgain?:    () => void;
  onNewGame?:      () => void;
  onStart?:        () => void;
  onGoToHub?:      () => void;
}

export interface SummaryOptions {
  nonDismissable?: boolean;
}

export function showSummaryModal(
  state:     GameState,
  config:    GameConfig,
  elapsedMs: number,
  cb:        SummaryCallbacks,
  opts:      SummaryOptions = {}
): void {
  const cfg        = GRID_CONFIGS[config.gridSizeKey];
  const doneWords  = state.words.filter(w => w.complete);
  const totalWords = cfg.targetWords;
  const score      = computeScore(state);
  const stars      = scoreToStars(doneWords.length, totalWords);
  const allDone    = doneWords.length === totalWords;
  const dLbl       = diffLabel(config.difficulty);
  const sizeLbl    = sizeLabel(config.gridSizeKey);
  const timeStr    = elapsedMs > 0 ? formatDuration(elapsedMs) : '—';

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

  // Letters revealed from hand/bonus tiles: on-grid vs off-grid (not in crossword)
  const gridLetters = getGridLetters(state.grid);
  const fromTiles = new Set<string>();
  for (const t of state.hand) if (t.revealed) fromTiles.add(t.letter);
  for (const t of state.bonus) if (t.revealed) fromTiles.add(t.letter);
  const sorted = [...fromTiles].sort();
  const usefulLets   = sorted.filter(l => gridLetters.has(l));
  const notUsefulLets = sorted.filter(l => !gridLetters.has(l));
  const lettersBlock =
    sorted.length > 0
      ? `<div class="sum-letters-section">
           <div class="sum-words-label">LETTERS YOU REVEALED</div>
           <div class="sum-letters-body">
             ${usefulLets.length > 0
               ? `<div class="sum-letters-row"><span class="sum-letters-tag sum-letters-useful">On card</span> ${usefulLets.join(' ')}</div>`
               : ''}
             ${notUsefulLets.length > 0
               ? `<div class="sum-letters-row"><span class="sum-letters-tag sum-letters-extra">Not on card</span> ${notUsefulLets.join(' ')}</div>`
               : ''}
           </div>
         </div>`
      : '';

  const { nonDismissable = false } = opts;
  const isSingleMode  = !!cb.onStart;
  const isHubMode     = !!cb.onGoToHub && !cb.onNewGame;
  const isEndGameMode = !!cb.onNewGame && !!cb.onGoToHub;
  const actionsHTML = isEndGameMode
    ? `<button class="btn btn-primary sum-btn-again">🎰 New Game</button>
       <button class="btn btn-secondary sum-btn-hub">🏠 Back to Hub</button>`
    : isHubMode
    ? `<button class="btn btn-primary sum-btn-hub">🏠 Return to Hub</button>`
    : isSingleMode
    ? `<button class="btn btn-primary sum-btn-start">🎰 Let's Play!</button>`
    : `<button class="btn btn-primary sum-btn-again">🎰 Play Again</button>`;

  const showClose = !nonDismissable && !isSingleMode && !isHubMode && !isEndGameMode;

  const overlay = createOverlay(ID, `
    <div class="def-modal sum-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">${allDone ? '🎉 Ticket Complete!' : doneWords.length > 0 ? '🎰 Game Summary' : '🎰 No Words Found'}</span>
        ${showClose ? '<button class="def-modal-close" aria-label="Close">✕</button>' : ''}
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
        ${lettersBlock}
        <div class="sum-actions">${actionsHTML}</div>
      </div>
    </div>`);

  if (isEndGameMode) {
    overlay.querySelector('.sum-btn-again')!.addEventListener('click', cb.onNewGame!);
    overlay.querySelector('.sum-btn-hub')!.addEventListener('click', cb.onGoToHub!);
  } else if (isHubMode) {
    overlay.querySelector('.sum-btn-hub')!.addEventListener('click', cb.onGoToHub!);
  } else if (isSingleMode) {
    const start = cb.onStart!;
    overlay.querySelector('.sum-btn-start')!.addEventListener('click', start);
    overlay.addEventListener('click', e => { if (e.target === overlay) start(); });
    onEscape(() => start());
  } else {
    overlay.querySelector('.sum-btn-again')!.addEventListener('click', cb.onPlayAgain!);
    if (showClose) {
      overlay.querySelector('.def-modal-close')?.addEventListener('click', hideSummaryModal);
      overlay.addEventListener('click', e => { if (e.target === overlay) hideSummaryModal(); });
      onEscape(hideSummaryModal);
    }
  }

  openModal(overlay);
}

export function hideSummaryModal(): void { closeModalById(ID); }
