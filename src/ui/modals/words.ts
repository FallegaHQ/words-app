import { createOverlay, openModal, closeModalById, bindClose } from './base';
import type { GameState, RenderCallbacks } from '../../types';

const ID = 'words-modal-overlay';

export function showWordsModal(state: GameState, cb: RenderCallbacks): void {
  const done  = state.words.filter(w => w.complete).length;
  const total = state.words.length;

  const badgesHTML = state.words.map(w =>
    `<div class="badge badge-clickable${w.complete ? ' done' : ''}" data-word="${w.text}">${w.text}</div>`
  ).join('');

  const overlay = createOverlay(ID, `
    <div class="def-modal words-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">📋 Words <span style="font-size:13px;opacity:.8">${done}/${total}</span></span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body words-modal-body">
        <div class="words-modal-badges">${badgesHTML}</div>
        <div class="words-modal-hint">Tap a word to look it up</div>
      </div>
    </div>`);

  overlay.querySelectorAll<HTMLElement>('[data-word]').forEach(el => {
    el.addEventListener('click', () => {
      hideWordsModal();
      cb.onWordClick(el.dataset.word!, () => showWordsModal(state, cb));
    });
  });

  bindClose(overlay, hideWordsModal);
  openModal(overlay);
}

export function hideWordsModal(): void { closeModalById(ID); }
