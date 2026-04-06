import { createOverlay, openModal, closeModalById, bindClose } from './base';
import { ACHIEVEMENTS } from '../../constants';

const ID = 'ach-modal-overlay';

export function showAchievementsModal(unlockedIds: Set<string>): void {
  const total    = ACHIEVEMENTS.length;
  const achieved = unlockedIds.size;

  const rows = ACHIEVEMENTS.map(a => {
    const unlocked = unlockedIds.has(a.id);
    return `<div class="ach-row${unlocked ? ' ach-unlocked' : ' ach-locked'}">
      <span class="ach-icon">${unlocked ? a.icon : '🔒'}</span>
      <div class="ach-info">
        <div class="ach-title">${unlocked ? a.title : '???'}</div>
        <div class="ach-desc">${unlocked ? a.description : 'Keep playing to unlock'}</div>
      </div>
      ${unlocked ? '<span class="ach-check">✓</span>' : ''}
    </div>`;
  }).join('');

  const overlay = createOverlay(ID, `
    <div class="def-modal ach-modal" role="dialog" aria-modal="true">
      <div class="def-modal-header">
        <span class="def-modal-word">🏅 Achievements
          <span style="font-size:13px;opacity:.8">${achieved}/${total}</span>
        </span>
        <button class="def-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="def-modal-body ach-body">
        <div class="ach-progress-bar">
          <div class="ach-progress-fill" style="width:${Math.round(achieved / total * 100)}%"></div>
        </div>
        <div class="ach-list">${rows}</div>
      </div>
    </div>`);

  bindClose(overlay, hideAchievementsModal);
  openModal(overlay);
}

export function hideAchievementsModal(): void { closeModalById(ID); }
