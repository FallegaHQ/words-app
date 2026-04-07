import './style.css';

// Core
import {
  generateGridOnlyAsync,
  assembleHandIntoState,
  revealTile,
  scratchCell,
  useLuckyDrawTile,
  buildDraftSegments,
  revealFullGridFog,
  generateRandomSeedString,
} from './core/gameLogic';
import { getWordBank, getDefinition, prefetchDictChunks } from './core/wordBank';
import { saveScore, getAllScores, getUnlockedIds, saveGameHistory, getGameHistory } from './core/storage';
import { computeScore } from './core/gameLogic';
import { checkAchievements } from './core/achievementCheck';

// UI
import { renderHub } from './ui/hub';
import {
  render,
  renderLoading,
  updateLoadingProgress,
  renderError,
  resetRenderer,
  startElapsedTimer,
  defaultGameViewContext,
} from './ui/game';
import { autoScratchAvailable } from './ui/autoScratch';
import { initSFX, playSFX } from './ui/sfx';

import { showDefinitionModal, hideDefinitionModal } from './ui/modals/definition';
import { showNewTicketModal, hideNewTicketModal } from './ui/modals/newTicket';
import { showHighScoreModal } from './ui/modals/highScores';
import { showSummaryModal, hideSummaryModal } from './ui/modals/summary';
import { showAchievementsModal } from './ui/modals/achievements';
import { showAchievementToast } from './ui/modals/toast';
import { showHowToPlayModal } from './ui/modals/howToPlay';
import { createOverlay, openModal, closeModalById } from './ui/modals/base';
import { showHistoryModal } from './ui/modals/history';

import { DIFFICULTY_PRESETS, DRAFT_COUNTS, ALPHABET, GRID_CONFIGS } from './constants';
import type { GameState, GameConfig, RenderCallbacks, Word, GameViewContext } from './types';

// ── App state ─────────────────────────────────────────────────────────────────

let state: GameState | null = null;
let currentConfig: GameConfig = {
  difficulty:    DIFFICULTY_PRESETS.medium,
  difficultyKey: 'medium',
  gridSizeKey:   'normal',
  seed:          generateRandomSeedString(),
  seedMode:      'random',
};

/** Draft picks (uppercase), one per segment */
let draftPicks: string[] = [];
let draftSegments: string[][] = [];
/** UI flow after grid load */
let gamePhase:
  | 'wild_autoscratch'
  | 'draft'
  | 'dealing'
  | 'hand_autoscratch'
  | 'play'
  | 'lucky_msg'
  | 'end_countdown' = 'play';

let endGameCountdown: number | null = null;
let lastCompleteWordCount = 0;
let autoScratchRunning = false;

// ── Session timer ─────────────────────────────────────────────────────────────

let timerStart: number | null = null;
let timerEnd: number | null = null;
let summaryShown = false;

function getElapsedMs(): number {
  if (!timerStart) return 0;
  return (timerEnd ?? Date.now()) - timerStart;
}

function resetSession(): void {
  timerStart   = null;
  timerEnd     = null;
  summaryShown = false;
  draftPicks   = [];
  draftSegments = [];
  endGameCountdown = null;
  lastCompleteWordCount = 0;
}

function finaliseSession(): void {
  timerEnd ??= Date.now();
  if (state) {
    const elapsed = getElapsedMs();
    saveScore(state, currentConfig, elapsed);
    saveGameHistory({
      date:          new Date().toISOString(),
      seed:          currentConfig.seed,
      seedMode:      currentConfig.seedMode,
      difficultyKey: currentConfig.difficultyKey,
      gridSizeKey:   currentConfig.gridSizeKey,
      words:         state.words.filter(w => w.complete).length,
      total:         GRID_CONFIGS[currentConfig.gridSizeKey].targetWords,
      score:         computeScore(state),
      elapsedMs:     elapsed,
    });
  }
}

/** True when the player has no more moves: all hand+bonus tiles revealed,
 *  and the lucky draw has either been used or was never available. */
function isHandExhausted(s: GameState): boolean {
  if (!s.hand.every(t => t.revealed) || !s.bonus.every(t => t.revealed)) return false;
  if (s.luckyDrawPool.length > 0 && !s.luckyDrawUsed) return false; // lucky draw still pending
  return true;
}

function sfxAuto(type: 'tick' | 'scratch'): void {
  playSFX(type);
}

// ── Achievements + word-complete SFX ──────────────────────────────────────────

function runAchievementSweep(): void {
  if (!state) return;
  const nw = state.words.filter(w => w.complete).length;
  if (nw > lastCompleteWordCount) {
    for (let k = 0; k < nw - lastCompleteWordCount; k++) playSFX('word_complete');
    lastCompleteWordCount = nw;
  }
  const newly = checkAchievements(state, currentConfig, getElapsedMs());
  newly.forEach(ach => showAchievementToast(ach.icon, ach.title));

  if (!summaryShown && gamePhase !== 'wild_autoscratch' && gamePhase !== 'draft' && gamePhase !== 'dealing' && state.words.length > 0 && (state.words.every(w => w.complete) || isHandExhausted(state))) {
    timerEnd ??= Date.now();
    void runEndGameCountdownAndSummary();
  }
}

// ── View context for hand panel / header ──────────────────────────────────────

function buildViewCtx(): GameViewContext {
  const v = defaultGameViewContext();
  if (!state) return v;

  v.seedDisplay      = currentConfig.seed;
  v.hideSeedInHeader = currentConfig.seedMode === 'daily_challenge';
  v.showCountdown    = endGameCountdown;

  if (gamePhase === 'end_countdown') {
    v.showWordsButton      = true;
    v.handPanelMessageOnly = null;
    v.handStatusMessage    =
      '🎉 All tiles used! The fog of war has been eradicated! You can now see everything, for 5 seconds!';
    v.lockHandTileClicks   = true;
    v.interactionLocked    = true;
    return v;
  }

  if (gamePhase === 'wild_autoscratch') {
    v.showWordsButton       = false;
    v.handPanelMessageOnly  = 'Opening wild ⭐ cells…';
    v.handStatusMessage     = 'Auto-scratch in progress...';
    v.lockHandTileClicks    = true;
    v.interactionLocked     = true;
    return v;
  }

  if (gamePhase === 'draft') {
    v.showWordsButton   = false;
    v.draft = {
      segments:     draftSegments,
      segmentIndex: draftPicks.length,
      picks:        [...draftPicks],
    };
    v.handStatusMessage  = '';
    v.interactionLocked  = false;
    return v;
  }

  if (gamePhase === 'dealing') {
    v.showWordsButton      = false;
    v.handPanelMessageOnly = 'Dealing your tiles…';
    v.handStatusMessage    = 'Building your hand from your draft picks.';
    v.lockHandTileClicks   = true;
    v.interactionLocked    = true;
    return v;
  }

  if (gamePhase === 'hand_autoscratch') {
    v.showWordsButton      = false;
    v.handStatusMessage    = 'Auto-scratching every open cell — please wait…';
    v.handPanelMessageOnly = null;
    v.lockHandTileClicks   = true;
    v.interactionLocked    = true;
    return v;
  }

  if (gamePhase === 'lucky_msg') {
    v.showWordsButton      = true;
    v.handPanelMessageOnly = 'Your lucky letter is in play — keep scratching!';
    v.handStatusMessage    = '';
    v.lockHandTileClicks   = false;
    v.interactionLocked    = false;
    return v;
  }

  // play
  v.showWordsButton      = true;
  v.handPanelMessageOnly = null;
  v.handStatusMessage    = '';
  v.lockHandTileClicks   = false;
  v.interactionLocked    = false;
  return v;
}


// ── End game overlay ──────────────────────────────────────────────────────────────

function setClickOverlay(enabled: boolean): void {
  const ID = 'click-blocker-overlay';
  if (enabled) {
    if (document.getElementById(ID)) return;
    const el = document.createElement('div');
    el.id = ID;
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:not-allowed;';
    document.body.appendChild(el);
  } else {
    document.getElementById(ID)?.remove();
  }
}

// ── State update ──────────────────────────────────────────────────────────────

function update(next: GameState, opts?: { skipAchievements?: boolean }): void {
  state = next;
  render(state, callbacks, currentConfig, buildViewCtx());
  if (opts?.skipAchievements) return;
  runAchievementSweep();
}

/**
 * Auto-scratch all eligible cells. After Lucky Draw, pass `endInLuckyMsg` so the hand
 * panel shows the post-lucky message instead of tiles again.
 */
async function runAutoScratchNormal(opts?: { endInLuckyMsg?: boolean }): Promise<void> {
  if (!state || autoScratchRunning) return;
  autoScratchRunning = true;
  try {
    gamePhase = 'hand_autoscratch';
    render(state, callbacks, currentConfig, buildViewCtx());
    await autoScratchAvailable(
      () => state!,
      (r, c) => {
        state = scratchCell(state!, r, c);
        update(state!, { skipAchievements: true });
      },
      150,
      { wildOnly: false, onSFX: sfxAuto }
    );
    gamePhase = opts?.endInLuckyMsg ? 'lucky_msg' : 'play';
    if (state) render(state, callbacks, currentConfig, buildViewCtx());
    runAchievementSweep();
  } finally {
    autoScratchRunning = false;
  }
}

async function runWildAutoScratch(): Promise<void> {
  if (!state) return;
  gamePhase = 'wild_autoscratch';
  render(state, callbacks, currentConfig, buildViewCtx());
  await autoScratchAvailable(
    () => state!,
    (r, c) => {
      state = scratchCell(state!, r, c);
      update(state!, { skipAchievements: true });
    },
    150,
    { wildOnly: true, onSFX: sfxAuto }
  );
  runAchievementSweep();
}

async function finishDraftAndDeal(): Promise<void> {
  if (!state) return;
  const { handSize, bonusSize } = GRID_CONFIGS[currentConfig.gridSizeKey];

  gamePhase = 'dealing';
  render(state, callbacks, currentConfig, buildViewCtx());
  await new Promise<void>(r => setTimeout(r, 350));

  state = assembleHandIntoState(
    state,
    currentConfig.difficulty,
    handSize,
    bonusSize,
    currentConfig.difficultyKey,
    draftPicks,
    currentConfig.seed
  );

  gamePhase = 'hand_autoscratch';
  update(state, { skipAchievements: true });
  await runAutoScratchNormal();

  gamePhase = 'play';
  if (state) {
    render(state, callbacks, currentConfig, buildViewCtx());
    prefetchDictChunks(state.words.map((w: Word) => w.text));
  }
  runAchievementSweep();
}

async function runEndGameCountdownAndSummary(): Promise<void> {
  if (!state || summaryShown) return;
  summaryShown = true;
  finaliseSession();
  playSFX('game_complete');

  // Step 1: Reveal the full board immediately so the player can see it
  state = revealFullGridFog(state);
  gamePhase = 'end_countdown';
  render(state, callbacks, currentConfig, buildViewCtx());

  // Step 2: Hold the revealed board for 5 seconds before the countdown
  setClickOverlay(true);
  await new Promise<void>(r => setTimeout(r, 5000));

  // Step 3: Countdown
  for (let t = 5; t >= 1; t--) {
    endGameCountdown = t;
    if (state) render(state, callbacks, currentConfig, buildViewCtx());
    await new Promise<void>(r => setTimeout(r, 1000));
  }
  setClickOverlay(false);

  endGameCountdown = null;
  gamePhase = 'play';
  render(state, callbacks, currentConfig, buildViewCtx());

  // Step 4: Non-dismissable summary with New Game + Back to Hub
  showAutoSummary();
}

function goToHub(): void {
  resetSession();
  resetRenderer();
  renderHub({
    onNewGame: () => {
      showNewTicketModal(currentConfig, newConfig => {
        hideNewTicketModal();
        currentConfig = newConfig;
        startNewGame();
      });
    },
    onDailyChallenge: () => {
      showNewTicketModal(currentConfig, newConfig => {
        hideNewTicketModal();
        currentConfig = newConfig;
        startNewGame();
      }, { dailyChallenge: true });
    },
    onHowToPlay: showHowToPlayModal,
    onHistory: () => {
      showHistoryModal(getGameHistory(), {
        onReplay: entry => {
          currentConfig = {
            difficulty:    DIFFICULTY_PRESETS[entry.difficultyKey],
            difficultyKey: entry.difficultyKey,
            gridSizeKey:   entry.gridSizeKey,
            seed:          entry.seed,
            seedMode:      entry.seedMode,
          };
          startNewGame();
        },
      });
    },
    onShowHighScores: () => showHighScoreModal(getAllScores(), currentConfig),
    onShowAchievements: () => showAchievementsModal(getUnlockedIds()),
  });
}

function showAutoSummary(): void {
  if (!state) return;
  showSummaryModal(state, currentConfig, getElapsedMs(), {
    onNewGame: () => {
      hideSummaryModal();
      showNewTicketModal(currentConfig, newConfig => {
        hideNewTicketModal();
        currentConfig = newConfig;
        startNewGame();
      }, {
        nonDismissable: true,
        onGoToHub: () => {
          hideNewTicketModal();
          goToHub();
        },
      });
    },
    onGoToHub: () => {
      hideSummaryModal();
      goToHub();
    },
  }, { nonDismissable: true });
}

// ── Render callbacks ──────────────────────────────────────────────────────────

const callbacks: RenderCallbacks = {
  onRevealTile: (i, isBonus) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    playSFX('tile_reveal');
    update(revealTile(state, i, isBonus), { skipAchievements: true });
    void runAutoScratchNormal();
  },

  onDraftPick: letter => {
    if (!state || gamePhase !== 'draft') return;
    const L = letter.toUpperCase();
    if (!/^[A-Z]$/.test(L)) return;
    playSFX('draft_pick');
    draftPicks.push(L);
    if (draftPicks.length >= draftSegments.length) {
      playSFX('draft_done');
      void finishDraftAndDeal();
    } else {
      render(state, callbacks, currentConfig, buildViewCtx());
    }
  },

  onScratchCell: () => { /* scratching is automatic — no cell UI */ },

  onLuckyDrawPick: letter => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    playSFX('lucky_pick');
    update(useLuckyDrawTile(state, letter), { skipAchievements: true });
    void runAutoScratchNormal({ endInLuckyMsg: true });
  },

  onNewGame: () => {
    showNewTicketModal(currentConfig, newConfig => {
      hideNewTicketModal();
      if (state && !summaryShown) {
        summaryShown = true;
        finaliseSession();
        showSummaryModal(state, currentConfig, getElapsedMs(), {
          onStart: () => {
            hideSummaryModal();
            currentConfig = newConfig;
            startNewGame();
          },
        });
      } else {
        currentConfig = newConfig;
        startNewGame();
      }
    });
  },

  onReturnToHub: () => {
    const CONFIRM_ID = 'hub-confirm-overlay';
    const overlay = createOverlay(CONFIRM_ID, `
      <div class="def-modal confirm-modal" role="dialog" aria-modal="true">
        <div class="def-modal-body">
          <div class="confirm-icon">🏠</div>
          <div class="confirm-title">Return to Hub?</div>
          <div class="confirm-msg">Your current game progress will be saved to your score history.</div>
          <div class="confirm-actions">
            <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
            <button class="btn btn-primary"   id="confirm-ok">Return to Hub</button>
          </div>
        </div>
      </div>`);

    overlay.querySelector('#confirm-cancel')!.addEventListener('click', () => closeModalById(CONFIRM_ID));
    overlay.querySelector('#confirm-ok')!.addEventListener('click', () => {
      closeModalById(CONFIRM_ID);
      if (!summaryShown) {
        summaryShown = true;
        finaliseSession();
      }
      showSummaryModal(state!, currentConfig, getElapsedMs(), {
        onGoToHub: () => {
          hideSummaryModal();
          goToHub();
        },
      });
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModalById(CONFIRM_ID); });
    openModal(overlay);
  },

  onWordClick: (word, onClosed) => handleWordClick(word, onClosed),
  onShowHighScores: () => showHighScoreModal(getAllScores(), currentConfig),
  onShowAchievements: () => showAchievementsModal(getUnlockedIds()),
};

// ── Word definition ───────────────────────────────────────────────────────────

async function handleWordClick(word: string, onClosed: () => void): Promise<void> {
  showDefinitionModal(word, null, onClosed);
  try {
    const def = await getDefinition(word);
    showDefinitionModal(word, def ?? '(No definition found)', onClosed);
  } catch {
    showDefinitionModal(word, '⚠️ Could not load dictionary.\nMake sure the /dictionary/ folder is in public/.', onClosed);
  }
}

// ── Game start ────────────────────────────────────────────────────────────────

async function startNewGame(): Promise<void> {
  hideDefinitionModal();
  resetSession();
  resetRenderer();
  renderLoading();

  let gridState: GameState | null = null;
  let failed = false;

  try {
    const wordBank = await getWordBank();
    await Promise.all([
      generateGridOnlyAsync(
        wordBank,
        (a, m, d) => updateLoadingProgress(a, m, d),
        currentConfig.gridSizeKey,
        currentConfig.seed
      )
        .then((s: GameState) => { gridState = s; })
        .catch(() => { failed = true; }),
      new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch {
    failed = true;
  }

  if (failed || !gridState) {
    renderError(goToHub);
    return;
  }

  state = gridState;

  const draftCount = DRAFT_COUNTS[currentConfig.gridSizeKey][currentConfig.difficultyKey];
  draftSegments = buildDraftSegments(ALPHABET, draftCount);
  draftPicks    = [];

  if (!timerStart) timerStart = Date.now();
  startElapsedTimer(getElapsedMs);

  await runWildAutoScratch();

  gamePhase = 'draft';
  if (state) render(state, callbacks, currentConfig, buildViewCtx());
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

initSFX();

renderHub({
  onNewGame: () => {
    showNewTicketModal(currentConfig, newConfig => {
      hideNewTicketModal();
      currentConfig = newConfig;
      startNewGame();
    });
  },
  onDailyChallenge: () => {
    showNewTicketModal(currentConfig, newConfig => {
      hideNewTicketModal();
      currentConfig = newConfig;
      startNewGame();
    }, { dailyChallenge: true });
  },
  onHowToPlay: showHowToPlayModal,
  onHistory: () => {
    showHistoryModal(getGameHistory(), {
      onReplay: entry => {
        currentConfig = {
          difficulty:    DIFFICULTY_PRESETS[entry.difficultyKey],
          difficultyKey: entry.difficultyKey,
          gridSizeKey:   entry.gridSizeKey,
          seed:          entry.seed,
          seedMode:      entry.seedMode,
        };
        startNewGame();
      },
    });
  },
  onShowHighScores: () => showHighScoreModal(getAllScores(), currentConfig),
  onShowAchievements: () => showAchievementsModal(getUnlockedIds()),
});