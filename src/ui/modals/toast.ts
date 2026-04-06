// ── Achievement toast ─────────────────────────────────────────────────────────

export function showAchievementToast(icon: string, title: string): void {
  const toast = document.createElement('div');
  toast.className = 'ach-toast';
  toast.innerHTML = `
    <span class="ach-toast-icon">${icon}</span>
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
