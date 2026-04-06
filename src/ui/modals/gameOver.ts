import { createOverlay, openModal, closeModalById } from './base';

const ID = 'game-over-overlay';

/**
 * Non-dismissable modal shown after the end-game countdown.
 * No close button, no backdrop click, no Escape — the player MUST click through.
 */
export function showGameOverModal(onViewResults: () => void): void {
  const overlay = createOverlay(ID, `
    <div class="def-modal game-over-modal" role="alertdialog" aria-modal="true" aria-labelledby="go-title">
      <div class="def-modal-header">
        <span class="def-modal-word" id="go-title">🎉 Game Complete!</span>
      </div>
      <div class="def-modal-body game-over-body">
        <div class="game-over-msg">The full board has been revealed.<br>Tap below to see how you did!</div>
        <div class="sum-actions">
          <button class="btn btn-primary game-over-cta" id="go-results-btn">📊 View Results</button>
        </div>
      </div>
    </div>`);

  // Strictly non-dismissable — no backdrop click, no Escape
  overlay.querySelector('#go-results-btn')!.addEventListener('click', () => {
    closeModalById(ID);
    onViewResults();
  });

  openModal(overlay);
}
