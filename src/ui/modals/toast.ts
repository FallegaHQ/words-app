// ── Achievement toast ─────────────────────────────────────────────────────────
// Queued: shows one toast at a time, each stays visible for 5 seconds.

const TOAST_VISIBLE_MS  = 5000;
const TOAST_OUT_MS      = 400; // matches CSS transition duration

interface ToastEntry { icon: string; title: string; }
const toastQueue: ToastEntry[] = [];
let toastBusy = false;

function processQueue(): void {
  if (toastBusy || toastQueue.length === 0) return;
  toastBusy = true;

  const { icon, title } = toastQueue.shift()!;

  const toast = document.createElement('div');
  toast.className = 'ach-toast';
  toast.innerHTML = `
    <span class="ach-toast-icon">${icon}</span>
    <div class="ach-toast-text">
      <div class="ach-toast-label">Achievement Unlocked!</div>
      <div class="ach-toast-title">${title}</div>
    </div>`;
  document.body.appendChild(toast);

  // Slide in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('ach-toast-visible'));
  });

  // Slide out after visible duration, then process next
  setTimeout(() => {
    toast.classList.remove('ach-toast-visible');
    setTimeout(() => {
      toast.remove();
      toastBusy = false;
      processQueue();
    }, TOAST_OUT_MS);
  }, TOAST_VISIBLE_MS);
}

export function showAchievementToast(icon: string, title: string): void {
  toastQueue.push({ icon, title });
  processQueue();
}
