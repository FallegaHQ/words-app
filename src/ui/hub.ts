// ── Hub ───────────────────────────────────────────────────────────────────────
// Landing screen shown before any game starts.

import { isSFXEnabled, setSFXEnabled } from './sfx';
import { APP_VERSION } from '../constants';

export interface HubCallbacks {
  onNewGame:        () => void;
  /** Same daily board for every player (UTC date seed) */
  onDailyChallenge: () => void;
  onHowToPlay:      () => void;
  onHistory?:       () => void;
  onShowHighScores?: () => void;
  onShowAchievements?: () => void;
}

export function renderHub(cb: HubCallbacks): void {
  const root = document.getElementById('app')!;
  const sfxOn = isSFXEnabled();
  root.innerHTML = `
    <div class="hub">
      <div class="hub-inner">
        <div class="hub-glow"></div>

        <div class="hub-logo">
          <div class="hub-logo-title">LUCKY LETTERS</div>
          <div class="hub-logo-sub">Scratch · Reveal · Win</div>
        </div>

        <div class="hub-tiles-preview" aria-hidden="true">
          ${['L','U','C','K','Y'].map(l =>
            `<div class="hub-tile">${l}</div>`
          ).join('')}
        </div>

        <div class="hub-actions">
          <button id="hub-btn-new-game" class="btn btn-primary  hub-btn-main">🎰 New Game</button>
          <button id="hub-btn-daily" class="btn btn-secondary hub-btn-daily">📅 Daily Challenge</button>
          <button id="hub-btn-history" class="btn btn-secondary hub-btn-secondary">📜 History</button>
          <button id="hub-btn-hs" class="btn btn-secondary hub-btn-secondary">🏆 High Scores</button>
          <button id="hub-btn-ach" class="btn btn-secondary hub-btn-secondary">🏅 Achievements</button>
          <button id="hub-btn-sfx" class="btn btn-secondary hub-btn-secondary hub-btn-sfx">${sfxOn ? '🔊 Sound On' : '🔇 Sound Off'}</button>
          <button id="hub-btn-how-to-play" class="btn btn-secondary hub-btn-secondary">❓ How to Play</button>
        </div>

        <div class="hub-footer">
          Find every word · Beat your high score · Unlock achievements · Challege your friends 
          <div class="hub-version">v${APP_VERSION}</div>
        </div>
      </div>
    </div>`;

  root.querySelector('#hub-btn-new-game')!   .addEventListener('click', cb.onNewGame);
  root.querySelector('#hub-btn-daily')!      .addEventListener('click', cb.onDailyChallenge);
  root.querySelector('#hub-btn-how-to-play')!.addEventListener('click', cb.onHowToPlay);
  root.querySelector('#hub-btn-history')!    .addEventListener('click', () => cb.onHistory?.());
  root.querySelector('#hub-btn-hs')!         .addEventListener('click', () => cb.onShowHighScores?.());
  root.querySelector('#hub-btn-ach')!        .addEventListener('click', () => cb.onShowAchievements?.());

  const sfxBtn = root.querySelector<HTMLElement>('#hub-btn-sfx')!;
  sfxBtn.addEventListener('click', () => {
    const on = !isSFXEnabled();
    setSFXEnabled(on);
    sfxBtn.textContent = on ? '🔊 Sound On' : '🔇 Sound Off';
  });
}
