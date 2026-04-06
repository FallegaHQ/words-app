import { createOverlay, openModal, closeModalById, bindClose } from './base';

const ID = 'def-modal-overlay';

export function showDefinitionModal(word: string, definition: string | null, onClose?: () => void): void {
  const overlay = createOverlay(ID, `
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
    </div>`);

  const doClose = () => { hideDefinitionModal(); onClose?.(); };
  bindClose(overlay, doClose);
  openModal(overlay);
}

export function hideDefinitionModal(): void { closeModalById(ID); }
