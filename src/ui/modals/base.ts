// ── Shared modal helpers ──────────────────────────────────────────────────────

/**
 * Create a modal overlay element and append it to body.
 * Returns the overlay. Call `openModal(overlay)` after binding events
 * to trigger the CSS enter transition.
 */
export function createOverlay(id: string, innerHTML: string): HTMLDivElement {
  document.getElementById(id)?.remove();
  const overlay = document.createElement('div');
  overlay.id        = id;
  overlay.className = 'def-modal-overlay';
  overlay.innerHTML = innerHTML;
  document.body.appendChild(overlay);
  return overlay;
}

/** Trigger the visible CSS transition (call after appending to DOM). */
export function openModal(overlay: HTMLElement): void {
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

/** Close a modal by ID with a fade-out transition, then remove it. */
export function closeModalById(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

/** Register Escape-key handler; removes itself on first trigger. */
export function onEscape(handler: () => void): void {
  const listener = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handler();
      document.removeEventListener('keydown', listener);
    }
  };
  document.addEventListener('keydown', listener);
}

/** Wire up close button + backdrop click + Escape for a modal. */
export function bindClose(overlay: HTMLElement, closeFn: () => void): void {
  overlay.querySelector('.def-modal-close')?.addEventListener('click', closeFn);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeFn(); });
  onEscape(closeFn);
}
